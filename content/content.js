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
  let observer = null;
  let mountTimer = null;
  let settings = {
    ...resolveFilenameTemplateOptions(),
    ...resolveDownloadOptions(),
  };
  let settingsLoadPromise = null;

  injectPageScripts();
  bindPageMessages();
  installObserver();
  loadSettings().then(mountAllTweets);
  window.addEventListener('popstate', scheduleMountAll, { passive: true });
  window.addEventListener('load', scheduleMountAll, { passive: true });

  if (chrome.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') {
        return;
      }
      if (!changes.primaryTemplate && !changes.fallbackTemplate && !changes.downloadSubdirectory && !changes.downloadMode) {
        return;
      }
      settings = {
        ...resolveFilenameTemplateOptions({
          primaryTemplate: changes.primaryTemplate?.newValue,
          fallbackTemplate: changes.fallbackTemplate?.newValue,
        }),
        ...resolveDownloadOptions({
          downloadSubdirectory: changes.downloadSubdirectory?.newValue,
          downloadMode: changes.downloadMode?.newValue,
        }),
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

      chrome.storage.local.get(['primaryTemplate', 'fallbackTemplate', 'downloadSubdirectory', 'downloadMode'], (stored) => {
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
      return;
    }

    downloadingArticles.add(article);
    await loadSettings();
    const availability = getMediaAvailability(article);
    if (!availability.hasAny) {
      downloadingArticles.delete(article);
      updateStatus(statusNode, 'No downloadable media found', false, true);
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

      updateStatus(statusNode, `Started downloading ${total} media files`, false);
    } catch (error) {
      updateStatus(statusNode, `Media download failed: ${error.message || error}`, false, true);
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

      await sendDownload({
        mediaType: 'image',
        url: image.url,
        filename,
        tweetId: tweetId || 'tweet',
        saveAs: settings.downloadMode === 'ask',
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

      await sendDownload({
        mediaType: 'video',
        url: video.bestUrl,
        filename,
        tweetId: tweetId || 'tweet',
        saveAs: settings.downloadMode === 'ask',
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
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_MEDIA', payload }, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        if (!response?.ok) {
          reject(new Error(response?.error || 'Download failed'));
          return;
        }

        resolve(response);
      });
    });
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
