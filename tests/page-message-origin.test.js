const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const shared = require('../content/shared.js');

const contentScriptSource = fs.readFileSync(
  path.join(__dirname, '..', 'content', 'content.js'),
  'utf8'
);

function loadContentTestApi(overrides = {}) {
  const bootstrapWindow = overrides.window;
  if (bootstrapWindow) {
    bootstrapWindow.XMDShared = overrides.xmdShared || bootstrapWindow.XMDShared || {
      ...shared,
    };
    bootstrapWindow.XMDDomUtils = overrides.xmdDomUtils || bootstrapWindow.XMDDomUtils || {
      findTweetArticles: () => [],
      extractTweetIdFromArticle: () => null,
      extractAuthorFromArticle: () => null,
      ensureButtonMount: () => null,
      collectDomImages: () => [],
    };
  }

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    chrome: overrides.chrome,
    window: bootstrapWindow,
    document: overrides.document,
    MutationObserver: overrides.MutationObserver,
  };

  sandbox.__captureXmdTestApi = (api) => {
    sandbox.__XMD_TEST_API__ = api;
  };

  vm.createContext(sandbox);
  vm.runInContext(contentScriptSource, sandbox);
  return sandbox.__XMD_TEST_API__;
}

test('content script ignores page-hook messages from unsupported origins', async () => {
  const dom = new JSDOM('<!doctype html><html><body><article></article></body></html>', { url: 'https://x.com/demo_user/status/1' });
  const article = dom.window.document.querySelector('article');
  const mount = dom.window.document.createElement('div');
  mount.className = 'xmd-actions xmd-actions--header';
  article.appendChild(mount);

  let messageHandler = null;
  const originalAddEventListener = dom.window.addEventListener.bind(dom.window);
  dom.window.addEventListener = (type, listener, options) => {
    if (type === 'message') {
      messageHandler = listener;
    }
    return originalAddEventListener(type, listener, options);
  };

  const api = loadContentTestApi({
    window: dom.window,
    document: dom.window.document,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    chrome: { runtime: { getURL: () => '', sendMessage: (_message, callback) => callback({ ok: true }), lastError: null } },
    xmdDomUtils: {
      findTweetArticles: () => [article],
      extractTweetIdFromArticle: () => '1',
      extractAuthorFromArticle: () => 'demo_user',
      ensureButtonMount: () => mount,
      collectDomImages: () => [],
    },
  });

  await api.loadSettings();
  assert.equal(typeof messageHandler, 'function');

  messageHandler({
    source: dom.window,
    origin: 'https://evil.example',
    data: {
      source: 'x-media-downloader',
      type: 'XMD_MEDIA_META',
      payload: {
        entries: [
          {
            tweetId: '1',
            author: 'demo_user',
            images: [{ url: 'https://pbs.twimg.com/media/demo?format=jpg&name=orig', index: 0 }],
            videos: [],
          },
        ],
      },
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(mount.querySelector('[data-xmd-kind="download"]'), null);
});

test('content script accepts page-hook messages from supported twitter.com origin', async () => {
  const dom = new JSDOM('<!doctype html><html><body><article></article></body></html>', { url: 'https://twitter.com/demo_user/status/1' });
  const article = dom.window.document.querySelector('article');
  const mount = dom.window.document.createElement('div');
  mount.className = 'xmd-actions xmd-actions--header';
  article.appendChild(mount);

  let messageHandler = null;
  const originalAddEventListener = dom.window.addEventListener.bind(dom.window);
  dom.window.addEventListener = (type, listener, options) => {
    if (type === 'message') {
      messageHandler = listener;
    }
    return originalAddEventListener(type, listener, options);
  };

  const api = loadContentTestApi({
    window: dom.window,
    document: dom.window.document,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    chrome: { runtime: { getURL: () => '', sendMessage: (_message, callback) => callback({ ok: true }), lastError: null } },
    xmdDomUtils: {
      findTweetArticles: () => [article],
      extractTweetIdFromArticle: () => '1',
      extractAuthorFromArticle: () => 'demo_user',
      ensureButtonMount: () => mount,
      collectDomImages: () => [],
    },
  });

  await api.loadSettings();
  assert.equal(typeof messageHandler, 'function');

  messageHandler({
    source: dom.window,
    origin: 'https://twitter.com',
    data: {
      source: 'x-media-downloader',
      type: 'XMD_MEDIA_META',
      payload: {
        entries: [
          {
            tweetId: '1',
            author: 'demo_user',
            images: [{ url: 'https://pbs.twimg.com/media/demo?format=jpg&name=orig', index: 0 }],
            videos: [],
          },
        ],
      },
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(mount.querySelector('[data-xmd-kind="download"]'));
});
