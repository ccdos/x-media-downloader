(function initContentScript() {
  const shared = window.XMDShared;
  const domUtils = window.XMDDomUtils;

  if (!shared || !domUtils) {
    console.warn('[XMD] shared helpers missing');
    return;
  }

  const { toOriginalImageUrl, buildDownloadFilename, resolveFilenameTemplateOptions, resolveDownloadOptions, applyDownloadSubdirectory, shouldUseDownloadSubdirectory } = shared;
  const {
    findTweetArticles,
    extractTweetIdFromArticle,
    extractAuthorFromArticle,
    extractTweetTextFromArticle = () => '',
    ensureButtonMount,
    collectDomImages,
  } = domUtils;

  const mediaStore = new Map();
  const downloadingArticles = new WeakSet();
  const DOWNLOAD_RESPONSE_TIMEOUT_MS = 15000;
  const LOG_PREFIX = '[XMD]';
  const PAGE_LOG_EVENT = 'xmd:log';
  let observer = null;
  let mountTimer = null;
  let settings = {
    ...resolveFilenameTemplateOptions(),
    ...resolveDownloadOptions(),
  };
  let settingsLoadPromise = null;

  injectPageScripts();
  log('info', 'Content script initialized', {
    url: window.location?.href || '',
  });
  bindPageMessages();
  bindRuntimeMessages();
  installObserver();
  loadSettings().then(mountAllTweets);
  window.addEventListener('popstate', scheduleMountAll, { passive: true });
  window.addEventListener('load', scheduleMountAll, { passive: true });

  if (chrome.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') {
        return;
      }
      if (!changes.primaryTemplate && !changes.fallbackTemplate && !changes.downloadSubdirectory && !changes.downloadMode && !changes.debugLogging) {
        return;
      }
      const nextSettings = {
        primaryTemplate: changes.primaryTemplate ? changes.primaryTemplate.newValue : settings.primaryTemplate,
        fallbackTemplate: changes.fallbackTemplate ? changes.fallbackTemplate.newValue : settings.fallbackTemplate,
        downloadSubdirectory: changes.downloadSubdirectory ? changes.downloadSubdirectory.newValue : settings.downloadSubdirectory,
        downloadMode: changes.downloadMode ? changes.downloadMode.newValue : settings.downloadMode,
        debugLogging: changes.debugLogging ? changes.debugLogging.newValue : settings.debugLogging,
      };
      settings = {
        ...resolveFilenameTemplateOptions(nextSettings),
        ...resolveDownloadOptions(nextSettings),
      };
      scheduleMountAll();
    });
  }

  function injectPageScripts() {
    if (document.documentElement.dataset.xmdInjected === '1') {
      return;
    }

    document.documentElement.dataset.xmdInjected = '1';
    const resources = [
      'content/page-logger.js',
      'content/shared.js',
      'content/media-extractor.js',
      'content/inject.js',
    ];

    for (const resource of resources) {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(resource);
      script.dataset.xmdInjectedScript = resource;
      script.async = false;
      (document.head || document.documentElement).appendChild(script);
    }
  }

  function bindPageMessages() {
    window.addEventListener('message', (event) => {
      if (event.source !== window || !isAllowedPageMessageOrigin(event.origin)) {
        return;
      }

      const data = event.data;
      if (!data || data.source !== 'x-media-downloader' || data.type !== 'XMD_MEDIA_META') {
        return;
      }

      const entries = Array.isArray(data.payload?.entries) ? data.payload.entries : [];
      let changed = false;
      entries.forEach((entry) => {
        if (!entry || !entry.tweetId) {
          return;
        }

        const previous = mediaStore.get(entry.tweetId) || { tweetId: entry.tweetId, author: entry.author || 'unknown', images: [], videos: [] };
        previous.author = previous.author === 'unknown' ? (entry.author || previous.author) : previous.author;
        previous.images = mergeByUrl(previous.images, entry.images || [], 'url');
        previous.videos = mergeByUrl(previous.videos, entry.videos || [], 'bestUrl');
        mediaStore.set(entry.tweetId, previous);
        changed = true;
      });

      if (changed) {
        scheduleMountAll();
      }
    });
  }

  function bindRuntimeMessages() {
    if (!chrome.runtime?.onMessage?.addListener) {
      return;
    }

    chrome.runtime.onMessage.addListener((message) => {
      if (!message || message.type !== 'DOWNLOAD_STATUS') {
        return false;
      }

      const payload = message.payload || {};
      const level = payload.error || payload.phase === 'stalled' ? 'warn' : 'info';
      log(level, 'Chrome download status', payload);
      return false;
    });
  }

  function isAllowedPageMessageOrigin(origin) {
    if (!origin) {
      return true;
    }

    return origin === 'https://x.com' || origin === 'https://twitter.com';
  }

  function installObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      let shouldRefresh = false;
      for (const mutation of mutations) {
        if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) {
          continue;
        }

        const target = mutation.target;
        const targetIsTweet = isTweetScopedNode(target);
        const addedTweetNode = Array.from(mutation.addedNodes).some((node) => isTweetScopedNode(node));
        if (targetIsTweet || addedTweetNode) {
          shouldRefresh = true;
          break;
        }
      }

      if (shouldRefresh) {
        scheduleMountAll();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  async function loadSettings() {
    if (settingsLoadPromise) {
      return settingsLoadPromise;
    }

    settingsLoadPromise = new Promise((resolve) => {
      if (!chrome.storage?.local?.get) {
        settings = {
          ...resolveFilenameTemplateOptions(),
          ...resolveDownloadOptions(),
        };
        resolve(settings);
        return;
      }

      chrome.storage.local.get(['primaryTemplate', 'fallbackTemplate', 'downloadSubdirectory', 'downloadMode', 'debugLogging'], (stored) => {
        settings = {
          ...resolveFilenameTemplateOptions(stored || {}),
          ...resolveDownloadOptions(stored || {}),
        };
        resolve(settings);
      });
    }).finally(() => {
      settingsLoadPromise = null;
    });

    return settingsLoadPromise;
  }

  function scheduleMountAll() {
    if (mountTimer) {
      window.clearTimeout(mountTimer);
    }

    mountTimer = window.setTimeout(() => {
      mountTimer = null;
      mountAllTweets();
    }, 120);
  }

  function mountAllTweets() {
    const articles = findTweetArticles(document);
    articles.forEach(mountTweetActions);
  }

  function isTweetScopedNode(node) {
    if (!node || node.nodeType !== 1) {
      return false;
    }

    if (node.matches?.('article')) {
      return true;
    }

    if (node.matches?.('.xmd-actions, .xmd-actions *, [data-xmd-kind], .xmd-status')) {
      return false;
    }

    if (node.closest?.('.xmd-actions')) {
      return false;
    }

    const interactive = node.closest?.('button, [role="button"], a[href], a[aria-label]');
    if (interactive && interactive.closest?.('article')) {
      return true;
    }

    if (node.matches?.('img, video, [data-testid], [role="group"], time')) {
      return true;
    }

    return false;
  }

  function mountTweetActions(article) {
    if (!article) {
      return;
    }

    const availability = getMediaAvailability(article);
    const mount = ensureButtonMount(article);
    if (!mount) {
      return;
    }

    if (!availability.hasAny) {
      mount.replaceChildren();
      delete article.dataset.xmdMounted;
      return;
    }

    let button = mount.querySelector('[data-xmd-kind="download"]');
    let status = mount.querySelector('.xmd-status');

    if (!button) {
      button = createButton('download');
    }

    if (!button.dataset.xmdBound) {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await handleUnifiedDownload(article, status);
      });
      button.dataset.xmdBound = '1';
    }

    if (!status) {
      status = document.createElement('span');
      status.className = 'xmd-status';
    }

    mount.replaceChildren(button, status);
    article.dataset.xmdMounted = '1';
    refreshActionState(article);
  }

  function refreshActionState(article) {
    if (!article) {
      return;
    }

    const mount = article.querySelector('.xmd-actions');
    if (!mount) {
      return;
    }

    const button = mount.querySelector('[data-xmd-kind="download"]');
    const status = mount.querySelector('.xmd-status');
    if (!button) {
      return;
    }

    const availability = getMediaAvailability(article);
    button.disabled = !availability.hasAny;
    button.dataset.ready = availability.hasAny ? '1' : '0';
    button.dataset.hasVideo = availability.hasVideo ? '1' : '0';
    button.dataset.hasImage = availability.hasImage ? '1' : '0';

    if (!button.dataset.busy || button.dataset.busy === '0') {
      const label = availability.hasAny ? buildAriaLabel(availability) : 'No downloadable media found';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    }

    if (status && !status.dataset.busy) {
      if (availability.hasVideo && availability.hasImage) {
        status.textContent = 'Images and videos ready';
      } else if (availability.hasVideo) {
        status.textContent = 'Video ready';
      } else if (availability.hasImage) {
        status.textContent = 'Images ready';
      } else {
        status.textContent = 'Waiting for media';
      }
    }
  }

  function buildAriaLabel(availability) {
    if (availability.hasVideo && availability.hasImage) {
      return `Download media (${availability.imageCount} images, ${availability.videoCount} videos)`;
    }
    if (availability.hasVideo) {
      return `Download video (${availability.videoCount})`;
    }
    return `Download images (${availability.imageCount})`;
  }

  function createButton(kind = 'download') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'xmd-btn xmd-btn--icon';
    button.dataset.xmdKind = kind;
    button.setAttribute('aria-label', 'Download media');
    button.setAttribute('title', 'Download media');
    button.innerHTML = getDownloadIconSvg();
    return button;
  }

  function getDownloadIconSvg() {
    return '<svg class="xmd-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3a1 1 0 0 1 1 1v8.59l2.3-2.29a1 1 0 1 1 1.4 1.41l-4 3.99a1 1 0 0 1-1.4 0l-4-3.99a1 1 0 1 1 1.4-1.41L11 12.59V4a1 1 0 0 1 1-1Z"></path><path d="M6 18a1 1 0 0 1 1 1v1h10v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"></path></svg>';
  }

  async function handleUnifiedDownload(article, statusNode) {
    if (downloadingArticles.has(article)) {
      log('debug', 'Ignoring duplicate download click while request is in flight');
      return;
    }

    downloadingArticles.add(article);
    await loadSettings();
    const availability = getMediaAvailability(article);
    log('info', 'Download click received', {
      tweetId: availability.tweetId,
      images: availability.imageCount,
      videos: availability.videoCount,
      mode: settings.downloadMode,
      hasSubdirectory: Boolean(settings.downloadSubdirectory),
    });
    if (!availability.hasAny) {
      downloadingArticles.delete(article);
      updateStatus(statusNode, 'No downloadable media found', false, true);
      log('warn', 'Download aborted because no media is available for this article');
      return;
    }

    const mount = article.querySelector('.xmd-actions');
    const button = mount?.querySelector('[data-xmd-kind="download"]');
    setButtonBusy(button, true, availability);
    updateStatus(statusNode, 'Downloading media…', true);

    try {
      let total = 0;
      if (availability.images.length) {
        total += await downloadImages(article, availability.images);
      }
      if (availability.videos.length) {
        total += await downloadVideos(article, availability.videos);
      }

      updateStatus(statusNode, `Submitted ${total} media files to Chrome downloads`, false);
      log('info', 'Download requests submitted to Chrome', {
        tweetId: availability.tweetId,
        total,
      });
    } catch (error) {
      updateStatus(statusNode, `Media download failed: ${error.message || error}`, false, true);
      log('error', 'Download request failed', serializeError(error));
    } finally {
      downloadingArticles.delete(article);
      setButtonBusy(button, false, availability);
      refreshActionState(article);
    }
  }

  async function downloadImages(article, images) {
    const tweetId = extractTweetIdFromArticle(article);
    const author = extractAuthorFromArticle(article) || mediaStore.get(tweetId)?.author || 'unknown';
    const postTitle = extractTweetTextFromArticle(article);

    const useSavedSubdirectory = shouldUseDownloadSubdirectory(settings);

    for (const [index, image] of images.entries()) {
      const renderedFilename = buildDownloadFilename({
        author,
        postTitle,
        tweetId: tweetId || 'tweet',
        kind: 'image',
        index: image.index ?? index,
        url: image.url,
        templates: settings,
      });
      const filename = useSavedSubdirectory
        ? applyDownloadSubdirectory(renderedFilename, settings.downloadSubdirectory)
        : renderedFilename;

      log('info', 'Requesting image download', {
        tweetId: tweetId || 'tweet',
        index: image.index ?? index,
        filename,
        saveAs: settings.downloadMode === 'ask',
      });
      await sendDownload({
        mediaType: 'image',
        url: image.url,
        filename,
        tweetId: tweetId || 'tweet',
        saveAs: settings.downloadMode === 'ask',
        debugLogging: settings.debugLogging,
      });
    }

    return images.length;
  }

  async function downloadVideos(article, videos) {
    const tweetId = extractTweetIdFromArticle(article);
    const author = extractAuthorFromArticle(article) || mediaStore.get(tweetId)?.author || 'unknown';
    const postTitle = extractTweetTextFromArticle(article);

    const useSavedSubdirectory = shouldUseDownloadSubdirectory(settings);

    for (const [index, video] of videos.entries()) {
      const renderedFilename = buildDownloadFilename({
        author,
        postTitle,
        tweetId: tweetId || 'tweet',
        kind: 'video',
        index: video.index ?? index,
        url: video.bestUrl,
        templates: settings,
      });
      const filename = useSavedSubdirectory
        ? applyDownloadSubdirectory(renderedFilename, settings.downloadSubdirectory)
        : renderedFilename;

      log('info', 'Requesting video download', {
        tweetId: tweetId || 'tweet',
        index: video.index ?? index,
        filename,
        saveAs: settings.downloadMode === 'ask',
        hasUrl: Boolean(video.bestUrl),
      });
      await sendDownload({
        mediaType: 'video',
        url: video.bestUrl,
        filename,
        tweetId: tweetId || 'tweet',
        saveAs: settings.downloadMode === 'ask',
        debugLogging: settings.debugLogging,
      });
    }

    return videos.length;
  }

  function getMediaAvailability(article) {
    const tweetId = extractTweetIdFromArticle(article);
    const entry = tweetId ? mediaStore.get(tweetId) : null;
    const images = entry?.images?.length
      ? entry.images
      : collectDomImages(article).map((item, index) => ({
          index,
          url: toOriginalImageUrl(item.rawUrl || item.url),
          rawUrl: item.rawUrl || item.url,
          type: 'photo',
        }));
    const videos = entry?.videos?.length ? entry.videos : [];

    return {
      tweetId,
      images,
      videos,
      imageCount: images.length,
      videoCount: videos.length,
      hasImage: images.length > 0,
      hasVideo: videos.length > 0,
      hasAny: images.length > 0 || videos.length > 0,
    };
  }

  function setButtonBusy(button, busy, availability) {
    if (!button) {
      return;
    }

    button.dataset.busy = busy ? '1' : '0';
    button.disabled = busy || !availability?.hasAny;
    const label = busy ? 'Downloading media' : (availability?.hasAny ? buildAriaLabel(availability) : 'No downloadable media found');
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  }

  function sendDownload(payload) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error(`Background download response timed out after ${DOWNLOAD_RESPONSE_TIMEOUT_MS}ms`));
      }, DOWNLOAD_RESPONSE_TIMEOUT_MS);

      chrome.runtime.sendMessage({ type: 'DOWNLOAD_MEDIA', payload }, (response) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          log('error', 'Runtime error while sending download message', runtimeError.message);
          reject(new Error(runtimeError.message));
          return;
        }

        if (!response?.ok) {
          log('error', 'Background rejected download message', response?.error || response);
          reject(new Error(response?.error || 'Download failed'));
          return;
        }

        log('info', 'Background accepted download message', {
          mediaType: payload.mediaType,
          downloadId: response.downloadId,
          download: response.download || null,
        });
        resolve(response);
      });
    });
  }

  function log(level, message, details) {
    if (!settings.debugLogging) {
      return;
    }

    const method = typeof console[level] === 'function' ? level : 'log';
    console[method](LOG_PREFIX, message, details ?? '');

    try {
      if (typeof window.CustomEvent !== 'function') {
        return;
      }
      window.dispatchEvent(new window.CustomEvent(PAGE_LOG_EVENT, {
        detail: JSON.stringify({
          level: method,
          message,
          details: details ?? null,
        }),
      }));
    } catch (error) {
      console.warn(LOG_PREFIX, 'Unable to forward log to page context', error);
    }
  }

  function serializeError(error) {
    if (!error || typeof error !== 'object') {
      return error;
    }
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  function updateStatus(node, text, busy, isError = false) {
    if (!node) {
      return;
    }

    node.textContent = text;
    node.dataset.busy = busy ? '1' : '0';
    node.dataset.error = isError ? '1' : '0';
  }

  function mergeByUrl(existing, incoming, key) {
    const map = new Map();
    for (const item of existing || []) {
      if (item && item[key]) {
        map.set(item[key], item);
      }
    }
    for (const item of incoming || []) {
      if (item && item[key]) {
        map.set(item[key], item);
      }
    }
    return Array.from(map.values()).sort((left, right) => (left.index || 0) - (right.index || 0));
  }

  if (typeof globalThis.__captureXmdTestApi === 'function') {
    globalThis.__captureXmdTestApi({
      createButton,
      mergeByUrl,
      updateStatus,
      buildAriaLabel,
      getDownloadIconSvg,
      mountTweetActions,
      handleUnifiedDownload,
      loadSettings,
    });
  }
})();
