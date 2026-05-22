const DOWNLOAD_API_TIMEOUT_MS = 12000;
const DOWNLOAD_MONITOR_INTERVAL_MS = 1000;
const DOWNLOAD_MONITOR_MAX_TICKS = 45;
const monitoredDownloadIds = new Set();
const downloadTabs = new Map();
const downloadMonitorTimers = new Map();

if (chrome.downloads?.onChanged && !globalThis.__xmdDownloadListenersInstalled) {
  globalThis.__xmdDownloadListenersInstalled = true;
  chrome.downloads.onChanged.addListener((delta) => {
    if (!monitoredDownloadIds.has(delta.id)) {
      return;
    }

    debugLog(true, 'info', 'Download changed', {
      downloadId: delta.id,
      ...summarizeDownloadDelta(delta),
    });
    forwardDownloadStatus(delta.id, 'changed', summarizeDownloadDelta(delta));
  });

  chrome.downloads.onErased.addListener((downloadId) => {
    if (!monitoredDownloadIds.has(downloadId)) {
      return;
    }

    monitoredDownloadIds.delete(downloadId);
    debugLog(true, 'warn', 'Download erased', { downloadId });
    forwardDownloadStatus(downloadId, 'erased', { downloadId });
    downloadTabs.delete(downloadId);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'DOWNLOAD_MEDIA') {
    return false;
  }

  debugLog(message.payload?.debugLogging, 'info', 'DOWNLOAD_MEDIA received', {
    tabId: sender?.tab?.id,
    frameId: sender?.frameId,
    mediaType: message.payload?.mediaType,
    tweetId: message.payload?.tweetId,
    saveAs: Boolean(message.payload?.saveAs),
  });

  handleDownload(message.payload, sender)
    .then((result) => {
      debugLog(message.payload?.debugLogging, 'info', 'Download started', result);
      sendResponse({ ok: true, ...result });
    })
    .catch((error) => {
      debugLog(message.payload?.debugLogging, 'error', 'Download failed', error);
      sendResponse({ ok: false, error: error.message || String(error) });
    });

  return true;
});

async function handleDownload(payload = {}, sender = {}) {
  const { url, filename, saveAs = false, debugLogging = false } = payload;

  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error('Invalid download URL');
  }

  const options = {
    url,
    filename: sanitizeFilename(filename),
    saveAs: Boolean(saveAs),
    conflictAction: 'uniquify',
  };

  debugLog(debugLogging, 'debug', 'Calling chrome.downloads.download', {
    filename: options.filename,
    saveAs: options.saveAs,
    urlHost: getUrlHost(url),
  });

  const downloadId = await downloadWithChromeApi(options);
  const downloadItem = debugLogging ? await getDownloadItem(downloadId) : null;

  if (debugLogging) {
    monitoredDownloadIds.add(downloadId);
    if (sender?.tab?.id != null) {
      downloadTabs.set(downloadId, sender.tab.id);
    }
    debugLog(true, 'info', 'Download item created', summarizeDownloadItem(downloadItem));
    forwardDownloadStatus(downloadId, 'created', summarizeDownloadItem(downloadItem));
    monitorDownload(downloadId);
  }

  return {
    downloadId,
    download: summarizeDownloadItem(downloadItem),
  };
}

function downloadWithChromeApi(options) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(`chrome.downloads.download timed out after ${DOWNLOAD_API_TIMEOUT_MS}ms`));
    }, DOWNLOAD_API_TIMEOUT_MS);

    const finish = (callback) => {
      if (settled) {
        return;
      }
      clearTimeout(timeoutId);
      callback();
    };

    const settle = (callbackDownloadId) => {
      finish(() => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          settled = true;
          reject(new Error(runtimeError.message));
          return;
        }

        settled = true;
        resolve(callbackDownloadId);
      });
    };

    try {
      const maybePromise = chrome.downloads.download(options, settle);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(settle, (error) => {
          finish(() => {
            settled = true;
            reject(error);
          });
        });
      }
    } catch (error) {
      finish(() => {
        settled = true;
        reject(error);
      });
    }
  });
}

function getUrlHost(rawUrl) {
  try {
    return new URL(rawUrl).host;
  } catch (_error) {
    return 'invalid-url';
  }
}

function getDownloadItem(downloadId) {
  return new Promise((resolve) => {
    if (!chrome.downloads?.search || typeof downloadId !== 'number') {
      resolve(null);
      return;
    }

    chrome.downloads.search({ id: downloadId }, (items = []) => {
      resolve(items[0] || null);
    });
  });
}

function summarizeDownloadItem(item) {
  if (!item) {
    return null;
  }

  return {
    id: item.id,
    state: item.state,
    filename: item.filename,
    mime: item.mime,
    exists: item.exists,
    paused: item.paused,
    error: item.error,
    urlHost: getUrlHost(item.url || ''),
    bytesReceived: item.bytesReceived,
    totalBytes: item.totalBytes,
  };
}

function summarizeDownloadDelta(delta) {
  return {
    downloadId: delta.id,
    state: delta.state?.current,
    error: delta.error?.current,
    paused: delta.paused?.current,
    canResume: delta.canResume?.current,
    bytesReceived: delta.bytesReceived?.current,
    totalBytes: delta.totalBytes?.current,
  };
}

function forwardDownloadStatus(downloadId, phase, details) {
  const tabId = downloadTabs.get(downloadId);
  if (tabId == null || !chrome.tabs?.sendMessage) {
    return;
  }

  chrome.tabs.sendMessage(tabId, {
    type: 'DOWNLOAD_STATUS',
    payload: {
      phase,
      ...details,
    },
  }).catch?.(() => {
    // The tab may have navigated away; background logs still retain the status.
  });
}

function monitorDownload(downloadId) {
  if (downloadMonitorTimers.has(downloadId)) {
    return;
  }

  let ticks = 0;
  let previousSnapshot = '';
  const timerId = setInterval(async () => {
    ticks += 1;
    const item = await getDownloadItem(downloadId);
    const summary = summarizeDownloadItem(item) || { id: downloadId, missing: true };
    const snapshot = JSON.stringify(summary);

    if (snapshot !== previousSnapshot || ticks === DOWNLOAD_MONITOR_MAX_TICKS) {
      previousSnapshot = snapshot;
      debugLog(true, 'info', 'Download poll', {
        tick: ticks,
        ...summary,
      });
      forwardDownloadStatus(downloadId, 'poll', {
        tick: ticks,
        ...summary,
      });
    }

    if (!item || item.state !== 'in_progress' || ticks >= DOWNLOAD_MONITOR_MAX_TICKS) {
      clearInterval(timerId);
      downloadMonitorTimers.delete(downloadId);

      if (item?.state === 'in_progress') {
        const stalledSummary = {
          tick: ticks,
          likelyStalled: item.totalBytes > 0 && item.bytesReceived >= item.totalBytes,
          ...summary,
        };
        debugLog(true, 'warn', 'Download did not finish before monitor timeout', stalledSummary);
        forwardDownloadStatus(downloadId, 'stalled', stalledSummary);
      }

      if (!item || item.state !== 'in_progress') {
        monitoredDownloadIds.delete(downloadId);
        downloadTabs.delete(downloadId);
      }
    }
  }, DOWNLOAD_MONITOR_INTERVAL_MS);

  downloadMonitorTimers.set(downloadId, timerId);
}

function debugLog(enabled, level, message, details) {
  if (!enabled) {
    return;
  }

  const method = typeof console[level] === 'function' ? level : 'log';
  console[method]('[XMD background]', message, details ?? '');
}

function sanitizeFilename(filename) {
  const fallback = `x-media-${Date.now()}.bin`;
  if (!filename || typeof filename !== 'string') {
    return fallback;
  }

  return filename
    .replace(/[\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback;
}
