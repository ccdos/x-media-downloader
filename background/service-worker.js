chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'DOWNLOAD_MEDIA') {
    return false;
  }

  handleDownload(message.payload)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

async function handleDownload(payload = {}) {
  const { url, filename, saveAs = false } = payload;

  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error('Invalid download URL');
  }

  const downloadId = await chrome.downloads.download({
    url,
    filename: sanitizeFilename(filename),
    saveAs: Boolean(saveAs),
    conflictAction: 'uniquify',
  });

  return { downloadId };
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
