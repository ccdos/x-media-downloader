(function initPageHook() {
  if (window.__XMD_PAGE_HOOK_INSTALLED__) {
    return;
  }
  window.__XMD_PAGE_HOOK_INSTALLED__ = true;

  const extractor = window.XMDMediaExtractor;
  if (!extractor || typeof extractor.extractMediaEntries !== 'function') {
    return;
  }

  const seenSignatures = new Set();
  const originalFetch = window.fetch;
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  window.fetch = async function patchedFetch(...args) {
    const response = await originalFetch.apply(this, args);
    inspectFetchResponse(args[0], response);
    return response;
  };

  XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
    this.__xmdUrl = typeof url === 'string' ? url : '';
    return originalXHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function patchedSend(...args) {
    this.addEventListener('loadend', () => {
      inspectXhrResponse(this.__xmdUrl, this);
    });

    return originalXHRSend.apply(this, args);
  };

  function inspectFetchResponse(requestInfo, response) {
    const url = getRequestUrl(requestInfo, response?.url);
    if (!shouldInspect(url, response)) {
      return;
    }

    response.clone().json()
      .then((payload) => emitPayload(payload))
      .catch(() => undefined);
  }

  function inspectXhrResponse(url, xhr) {
    if (!shouldInspect(url, { headers: createHeaderReader(xhr.getResponseHeader.bind(xhr)) })) {
      return;
    }

    if (typeof xhr.responseText !== 'string' || !xhr.responseText) {
      return;
    }

    try {
      const payload = JSON.parse(xhr.responseText);
      emitPayload(payload);
    } catch (error) {
      // ignore non-JSON responses
    }
  }

  function emitPayload(payload) {
    const entries = extractor.extractMediaEntries(payload);
    if (!entries.length) {
      return;
    }

    const signature = JSON.stringify(entries.map((entry) => [entry.tweetId, entry.images.length, entry.videos.length]));
    if (seenSignatures.has(signature)) {
      return;
    }

    seenSignatures.add(signature);
    if (seenSignatures.size > 200) {
      const first = seenSignatures.values().next().value;
      seenSignatures.delete(first);
    }

    window.postMessage({
      source: 'x-media-downloader',
      type: 'XMD_MEDIA_META',
      payload: { entries },
    }, '*');
  }

  function shouldInspect(url, response) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    const isGraphQl = url.includes('/i/api/graphql/') || url.includes('/graphql/');
    if (!isGraphQl) {
      return false;
    }

    const contentType = response?.headers?.get?.('content-type') || '';
    return !contentType || contentType.includes('json');
  }

  function getRequestUrl(requestInfo, fallbackUrl = '') {
    if (typeof requestInfo === 'string') {
      return requestInfo;
    }
    if (requestInfo && typeof requestInfo.url === 'string') {
      return requestInfo.url;
    }
    return fallbackUrl || '';
  }

  function createHeaderReader(getResponseHeader) {
    return {
      get(name) {
        try {
          return getResponseHeader(name);
        } catch (error) {
          return '';
        }
      },
    };
  }
})();
