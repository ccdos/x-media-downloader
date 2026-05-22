(function installXmdPageLogger() {
  if (window.__xmdPageLoggerInstalled) {
    return;
  }

  window.__xmdPageLoggerInstalled = true;
  const prefix = '[XMD page]';

  window.addEventListener('xmd:log', (event) => {
    let payload;
    try {
      payload = JSON.parse(event.detail);
    } catch (_error) {
      console.info(prefix, event.detail);
      return;
    }

    const level = payload.level || 'log';
    const method = typeof console[level] === 'function' ? level : 'log';
    console[method](prefix, payload.message, formatDetails(payload.details));
  });

  function formatDetails(details) {
    if (details == null) {
      return '';
    }

    try {
      return JSON.stringify(details, null, 2);
    } catch (_error) {
      return details;
    }
  }
})();
