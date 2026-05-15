const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const {
  extractTweetIdFromUrl,
  extractAuthorFromStatusUrl,
  findHeaderActionBar,
  ensureButtonMount,
} = require('../content/dom-utils.js');

const contentScriptSource = fs.readFileSync(
  path.join(__dirname, '..', 'content', 'content.js'),
  'utf8'
);

function loadContentTestApi(overrides = {}) {
  const bootstrapWindow = overrides.window;
  if (bootstrapWindow) {
    bootstrapWindow.XMDShared = overrides.xmdShared || bootstrapWindow.XMDShared || {
      toOriginalImageUrl: (url) => url,
      buildDownloadFilename: ({ kind = 'media', index = 0 }) => `${kind}-${index}`,
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

test('extractTweetIdFromUrl returns numeric tweet id from x status URL', () => {
  assert.equal(
    extractTweetIdFromUrl('https://x.com/demo_user/status/1912345678901234567'),
    '1912345678901234567'
  );
});

test('extractTweetIdFromUrl ignores non-status URLs', () => {
  assert.equal(extractTweetIdFromUrl('https://x.com/home'), null);
});

test('extractAuthorFromStatusUrl returns author handle from status URL', () => {
  assert.equal(
    extractAuthorFromStatusUrl('https://twitter.com/demo_user/status/1912345678901234567/photo/1'),
    'demo_user'
  );
});

test('findHeaderActionBar prefers real-world top action wrapper around caret/grok controls', () => {
  const dom = new JSDOM(`
    <article>
      <div class="tweet-shell">
        <div class="tweet-main">
          <div class="header-row">
            <div data-testid="User-Name">demo_user</div>
            <div class="top-actions" data-testid="xmd-top-actions">
              <div class="action-wrap grok-wrap">
                <a href="https://x.com/i/grok" aria-label="Ask Grok"></a>
              </div>
              <div class="action-wrap caret-wrap">
                <button type="button" data-testid="caret" aria-label="More"></button>
              </div>
            </div>
          </div>
          <div data-testid="tweetText">正文</div>
          <div role="group" class="tweet-footer-actions">
            <button type="button" data-testid="reply">reply</button>
            <button type="button" data-testid="retweet">retweet</button>
            <button type="button" data-testid="like">like</button>
          </div>
        </div>
      </div>
    </article>
  `, { url: 'https://x.com/demo/status/1' });

  const article = dom.window.document.querySelector('article');
  const headerBar = findHeaderActionBar(article);

  assert.equal(headerBar?.getAttribute('data-testid'), 'xmd-top-actions');
});

test('ensureButtonMount inserts custom actions before grok wrapper in top toolbar', () => {
  const dom = new JSDOM(`
    <article>
      <div class="tweet-shell">
        <div class="tweet-main">
          <div class="header-row">
            <div data-testid="User-Name">demo_user</div>
            <div class="top-actions" data-testid="xmd-top-actions">
              <div class="action-wrap grok-wrap">
                <a href="https://x.com/i/grok" aria-label="Ask Grok"></a>
              </div>
              <div class="action-wrap caret-wrap">
                <button type="button" data-testid="caret" aria-label="More"></button>
              </div>
            </div>
          </div>
          <div role="group" class="tweet-footer-actions">
            <button type="button" data-testid="reply">reply</button>
            <button type="button" data-testid="retweet">retweet</button>
            <button type="button" data-testid="like">like</button>
          </div>
        </div>
      </div>
    </article>
  `, { url: 'https://x.com/demo/status/1' });

  const article = dom.window.document.querySelector('article');
  const mount = ensureButtonMount(article);
  const headerBar = article.querySelector('[data-testid="xmd-top-actions"]');
  const grokWrap = article.querySelector('.grok-wrap');
  const caretWrap = article.querySelector('.caret-wrap');

  assert.equal(mount.parentElement, headerBar);
  assert.equal(mount.nextElementSibling, grokWrap);
  assert.equal(grokWrap.nextElementSibling, caretWrap);
  assert.equal(mount.className, 'xmd-actions xmd-actions--header');
});

test('ensureButtonMount still inserts before visual grok sibling when grok icon has no href or aria-label', () => {
  const dom = new JSDOM(`
    <article>
      <div class="tweet-shell">
        <div class="tweet-main">
          <div class="header-row">
            <div data-testid="User-Name">demo_user</div>
            <div class="top-actions" data-testid="xmd-top-actions">
              <div class="action-wrap subscribe-wrap">
                <button type="button" aria-label="订阅">订阅</button>
              </div>
              <div class="action-wrap grok-wrap">
                <button type="button"><svg class="grok-mark"></svg></button>
              </div>
              <div class="action-wrap caret-wrap">
                <button type="button" data-testid="caret" aria-label="More"></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  `, { url: 'https://x.com/demo/status/1' });

  const article = dom.window.document.querySelector('article');
  const mount = ensureButtonMount(article);
  const grokWrap = article.querySelector('.grok-wrap');
  const subscribeWrap = article.querySelector('.subscribe-wrap');
  const caretWrap = article.querySelector('.caret-wrap');

  assert.equal(subscribeWrap.nextElementSibling, mount);
  assert.equal(mount.nextElementSibling, grokWrap);
  assert.equal(grokWrap.nextElementSibling, caretWrap);
});



test('ensureButtonMount prefers the real Grok button container over the adjacent caret cluster when Grok has aria-label', () => {
  const dom = new JSDOM(`
    <article>
      <div class="outer">
        <div class="css-175oi2r r-18u37iz r-1h0z5md grok-parent">
          <button aria-label="Grok 操作" role="button" type="button"></button>
        </div>
        <div class="css-175oi2r r-1awozwy r-6koalj r-18u37iz right-cluster">
          <div class="css-175oi2r left-slot"></div>
          <div class="css-175oi2r r-18u37iz r-1h0z5md more-parent">
            <button data-testid="caret" aria-label="More" type="button"></button>
          </div>
        </div>
      </div>
    </article>
  `, { url: 'https://x.com/demo/status/1' });

  const article = dom.window.document.querySelector('article');
  const mount = ensureButtonMount(article);
  const outer = article.querySelector('.outer');
  const grokParent = article.querySelector('.grok-parent');
  const rightCluster = article.querySelector('.right-cluster');

  assert.equal(mount.parentElement, outer);
  assert.equal(mount.nextElementSibling, grokParent);
  assert.equal(grokParent.nextElementSibling, rightCluster);
});

test('ensureButtonMount moves an existing bottom mount to header before grok when controls appear later', () => {
  const dom = new JSDOM(`
    <article>
      <div class="tweet-shell">
        <div class="tweet-main">
          <div class="header-row">
            <div data-testid="User-Name">demo_user</div>
            <div class="top-actions" data-testid="xmd-top-actions"></div>
          </div>
          <div role="group" class="tweet-footer-actions">
            <button type="button" data-testid="reply">reply</button>
            <button type="button" data-testid="retweet">retweet</button>
            <button type="button" data-testid="like">like</button>
          </div>
        </div>
      </div>
    </article>
  `, { url: 'https://x.com/demo/status/1' });

  const article = dom.window.document.querySelector('article');
  const firstMount = ensureButtonMount(article);
  const footerGroup = article.querySelector('.tweet-footer-actions');

  assert.equal(firstMount.previousElementSibling, footerGroup);

  const headerBar = article.querySelector('[data-testid="xmd-top-actions"]');
  headerBar.innerHTML = `
    <div class="action-wrap grok-wrap">
      <a href="https://x.com/i/grok" aria-label="Ask Grok"></a>
    </div>
    <div class="action-wrap caret-wrap">
      <button type="button" data-testid="caret" aria-label="More"></button>
    </div>
  `;

  const movedMount = ensureButtonMount(article);
  const grokWrap = article.querySelector('.grok-wrap');
  const caretWrap = article.querySelector('.caret-wrap');

  assert.equal(movedMount, firstMount);
  assert.equal(movedMount.parentElement, headerBar);
  assert.equal(movedMount.nextElementSibling, grokWrap);
  assert.equal(grokWrap.nextElementSibling, caretWrap);
  assert.equal(movedMount.className, 'xmd-actions xmd-actions--header');
});

test('createButton builds a single icon-style unified download control', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://x.com/home' });

  const api = loadContentTestApi({
    window: dom.window,
    document: dom.window.document,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    chrome: { runtime: { getURL: () => '', sendMessage: () => {}, lastError: null } },
  });

  const button = api.createButton('download');

  assert.equal(button.className, 'xmd-btn xmd-btn--icon');
  assert.equal(button.dataset.xmdKind, 'download');
  assert.equal(button.getAttribute('aria-label'), '下载媒体');
  assert.match(button.innerHTML, /svg/i);
});

test('mountTweetActions ignores a second click while a download is already in flight', async () => {
  const dom = new JSDOM('<!doctype html><html><body><article></article></body></html>', { url: 'https://x.com/demo/status/1' });
  const article = dom.window.document.querySelector('article');
  const mount = dom.window.document.createElement('div');
  mount.className = 'xmd-actions xmd-actions--header';
  article.appendChild(mount);

  let sendCount = 0;
  const pendingCallbacks = [];
  const api = loadContentTestApi({
    window: dom.window,
    document: dom.window.document,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    chrome: {
      runtime: {
        getURL: () => '',
        lastError: null,
        sendMessage: (_message, callback) => {
          sendCount += 1;
          pendingCallbacks.push(callback);
        },
      },
    },
    xmdDomUtils: {
      findTweetArticles: () => [article],
      extractTweetIdFromArticle: () => '1',
      extractAuthorFromArticle: () => 'demo_user',
      ensureButtonMount: () => mount,
      collectDomImages: () => [{ rawUrl: 'https://pbs.twimg.com/media/demo?format=jpg&name=small' }],
    },
  });

  api.mountTweetActions(article);
  const button = mount.querySelector('[data-xmd-kind="download"]');

  button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(sendCount, 1);
  pendingCallbacks.forEach((callback) => callback({ ok: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
});



test('observer ignores unrelated DOM additions inside an article to avoid remount flicker', async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><article><div class="tweet-body"><div id="hover-root"></div></div></article></body></html>',
    { url: 'https://x.com/demo/status/1' }
  );
  const article = dom.window.document.querySelector('article');
  const mount = dom.window.document.createElement('div');
  mount.className = 'xmd-actions xmd-actions--header';
  article.appendChild(mount);

  let observerCallback = null;
  let ensureMountCalls = 0;
  class FakeMutationObserver {
    constructor(callback) {
      observerCallback = callback;
    }
    observe() {}
    disconnect() {}
  }

  loadContentTestApi({
    window: dom.window,
    document: dom.window.document,
    MutationObserver: FakeMutationObserver,
    chrome: { runtime: { getURL: () => '', sendMessage: (_message, callback) => callback({ ok: true }), lastError: null } },
    xmdDomUtils: {
      findTweetArticles: () => [article],
      extractTweetIdFromArticle: () => '1',
      extractAuthorFromArticle: () => 'demo_user',
      ensureButtonMount: () => {
        ensureMountCalls += 1;
        return mount;
      },
      collectDomImages: () => [],
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 150));
  ensureMountCalls = 0;
  const hoverRoot = dom.window.document.getElementById('hover-root');
  const tooltipNode = dom.window.document.createElement('div');
  tooltipNode.textContent = 'hover state';
  hoverRoot.appendChild(tooltipNode);
  observerCallback([{ target: hoverRoot, addedNodes: [tooltipNode], removedNodes: [], type: 'childList' }]);
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.equal(ensureMountCalls, 0);
});

test('observer ignores unrelated DOM additions outside tweets to avoid remount flicker', async () => {
  const dom = new JSDOM('<!doctype html><html><body><article></article><div id="overlay-root"></div></body></html>', { url: 'https://x.com/demo/status/1' });
  const article = dom.window.document.querySelector('article');
  const mount = dom.window.document.createElement('div');
  mount.className = 'xmd-actions xmd-actions--header';
  article.appendChild(mount);

  let observerCallback = null;
  let ensureMountCalls = 0;
  class FakeMutationObserver {
    constructor(callback) {
      observerCallback = callback;
    }
    observe() {}
    disconnect() {}
  }

  loadContentTestApi({
    window: dom.window,
    document: dom.window.document,
    MutationObserver: FakeMutationObserver,
    chrome: { runtime: { getURL: () => '', sendMessage: (_message, callback) => callback({ ok: true }), lastError: null } },
    xmdDomUtils: {
      findTweetArticles: () => [article],
      extractTweetIdFromArticle: () => '1',
      extractAuthorFromArticle: () => 'demo_user',
      ensureButtonMount: () => {
        ensureMountCalls += 1;
        return mount;
      },
      collectDomImages: () => [],
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 150));
  ensureMountCalls = 0;
  const tooltipNode = dom.window.document.createElement('div');
  tooltipNode.textContent = 'tooltip';
  dom.window.document.getElementById('overlay-root').appendChild(tooltipNode);
  observerCallback([{ target: dom.window.document.getElementById('overlay-root'), addedNodes: [tooltipNode], removedNodes: [] }]);
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.equal(ensureMountCalls, 0);
});
