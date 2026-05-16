(function initDomUtils(globalScope) {
  const STATUS_URL_RE = /^https?:\/\/(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i;
  const HEADER_ANCHOR_SELECTORS = [
    '[data-testid="caret"]',
    'button[aria-label]',
    '[role="button"][aria-label]',
    'a[aria-label]',
    'a[href*="grok"]',
  ].join(', ');
  const BOTTOM_ACTION_TESTIDS = [
    'reply',
    'retweet',
    'unretweet',
    'like',
    'unlike',
    'bookmark',
    'removeBookmark',
    'share',
    'analytics',
  ];

  function extractTweetIdFromUrl(rawUrl) {
    if (typeof rawUrl !== 'string') {
      return null;
    }

    const match = rawUrl.match(STATUS_URL_RE);
    return match ? match[2] : null;
  }

  function extractAuthorFromStatusUrl(rawUrl) {
    if (typeof rawUrl !== 'string') {
      return null;
    }

    const match = rawUrl.match(STATUS_URL_RE);
    return match ? match[1] : null;
  }

  function findTweetArticles(root = document) {
    return Array.from(root.querySelectorAll('article'));
  }

  function getStatusAnchors(article) {
    if (!article || typeof article.querySelectorAll !== 'function') {
      return [];
    }

    return Array.from(article.querySelectorAll('a[href*="/status/"]')).filter((anchor) => {
      const href = anchor.href || anchor.getAttribute('href') || '';
      return Boolean(extractTweetIdFromUrl(toAbsoluteUrl(href)));
    });
  }

  function extractTweetIdFromArticle(article) {
    const anchor = getPreferredStatusAnchor(article);
    return anchor ? extractTweetIdFromUrl(anchor.href || anchor.getAttribute('href') || '') : null;
  }

  function extractAuthorFromArticle(article) {
    const anchor = getPreferredStatusAnchor(article);
    return anchor ? extractAuthorFromStatusUrl(anchor.href || anchor.getAttribute('href') || '') : null;
  }

  function extractTweetTextFromArticle(article) {
    if (!article || typeof article.querySelectorAll !== 'function') {
      return '';
    }

    const primary = article.querySelector('[data-testid="tweetText"]');
    if (primary) {
      return normalizeVisibleText(primary.textContent || '');
    }

    const textLikeNodes = Array.from(article.querySelectorAll('[lang]'))
      .filter((node) => !node.closest('[data-testid="User-Name"]'));
    const combined = textLikeNodes.map((node) => normalizeVisibleText(node.textContent || '')).filter(Boolean).join(' ');
    return normalizeVisibleText(combined);
  }

  function getPreferredStatusAnchor(article) {
    const anchors = getStatusAnchors(article);
    if (!anchors.length) {
      return null;
    }

    return anchors.sort((left, right) => scoreStatusAnchor(right) - scoreStatusAnchor(left))[0];
  }

  function scoreStatusAnchor(anchor) {
    const href = anchor.href || anchor.getAttribute('href') || '';
    let score = 0;
    if (/\/photo\//.test(href)) score += 1;
    if (/time/i.test(anchor.textContent || '')) score += 1;
    if (anchor.querySelector('time')) score += 3;
    return score;
  }

  function findHeaderActionBar(article) {
    return findHeaderMountPoint(article)?.container || null;
  }

  function findHeaderMountPoint(article) {
    if (!article || typeof article.querySelectorAll !== 'function') {
      return null;
    }

    const anchors = Array.from(article.querySelectorAll(HEADER_ANCHOR_SELECTORS))
      .filter((element) => !isBottomActionElement(element))
      .sort((left, right) => scoreHeaderAnchor(right) - scoreHeaderAnchor(left));

    for (const anchor of anchors) {
      const point = deriveHeaderMountPoint(article, anchor);
      if (point) {
        return point;
      }
    }

    return null;
  }

  function deriveHeaderMountPoint(article, anchor) {
    const clickable = anchor.closest('button, [role="button"], a[href], a[aria-label]') || anchor;
    let current = clickable;
    let depth = 0;

    while (current && current !== article && depth < 5) {
      const parent = current.parentElement;
      if (!parent || parent === article || isBottomActionTree(parent)) {
        current = parent;
        depth += 1;
        continue;
      }

      const actionChildren = Array.from(parent.children).filter((child) => {
        if (!isElement(child) || child.classList.contains('xmd-actions')) {
          return false;
        }
        if (isBottomActionTree(child)) {
          return false;
        }
        return Boolean(child.querySelector('button, [role="button"], a[href], a[aria-label]'));
      });

      const directChild = getDirectChildContaining(parent, clickable);
      const candidateLooksRight =
        directChild &&
        actionChildren.includes(directChild) &&
        actionChildren.length >= 1 &&
        actionChildren.length <= 4;

      if (candidateLooksRight) {
        return {
          container: parent,
          before: pickInsertBeforeNode(parent),
        };
      }

      current = parent;
      depth += 1;
    }

    return null;
  }

  function pickInsertBeforeNode(container) {
    const children = Array.from(container.children).filter((child) => isElement(child) && !child.classList.contains('xmd-actions'));

    const grokAnchor = container.querySelector('a[href*="grok"], a[aria-label*="Grok"], a[aria-label*="grok"], [role="button"][aria-label*="Grok"], [role="button"][aria-label*="grok"]');
    if (grokAnchor) {
      return getDirectChildContaining(container, grokAnchor) || grokAnchor;
    }

    const caretAnchor = container.querySelector('[data-testid="caret"], button[aria-label*="More"], [role="button"][aria-label*="More"]');
    const caretChild = caretAnchor ? (getDirectChildContaining(container, caretAnchor) || caretAnchor) : null;

    if (caretChild) {
      const caretIndex = children.indexOf(caretChild);
      if (caretIndex > 0) {
        return children[caretIndex - 1];
      }
      return caretChild;
    }

    return null;
  }

  function scoreHeaderAnchor(element) {
    const dataTestId = element.getAttribute?.('data-testid') || '';
    const ariaLabel = element.getAttribute?.('aria-label') || '';
    const href = element.getAttribute?.('href') || '';
    const text = `${dataTestId} ${ariaLabel} ${href} ${element.textContent || ''}`;

    let score = 0;
    if (/grok/i.test(ariaLabel)) score += 20;
    if (/grok/i.test(href)) score += 14;
    if (dataTestId === 'caret') score += 10;
    if (/more/i.test(text)) score += 6;
    if (/grok/i.test(text)) score += 5;
    if (element.tagName === 'BUTTON') score += 2;
    return score;
  }

  function isBottomActionElement(element) {
    if (!isElement(element)) {
      return false;
    }

    return Boolean(element.closest(BOTTOM_ACTION_TESTIDS.map((testId) => `[data-testid="${testId}"]`).join(', ')));
  }

  function isBottomActionTree(root) {
    if (!isElement(root)) {
      return false;
    }

    if (isBottomActionElement(root)) {
      return true;
    }

    const selector = BOTTOM_ACTION_TESTIDS.map((testId) => `[data-testid="${testId}"]`).join(', ');
    return Boolean(root.querySelector(selector));
  }

  function getDirectChildContaining(container, node) {
    if (!isElement(container) || !isElement(node) || !container.contains(node)) {
      return null;
    }

    let current = node;
    while (current && current.parentElement && current.parentElement !== container) {
      current = current.parentElement;
    }

    return current && current.parentElement === container ? current : null;
  }

  function isElement(node) {
    return Boolean(node) && node.nodeType === 1;
  }

  function normalizeVisibleText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getActionBar(article) {
    if (!article || typeof article.querySelectorAll !== 'function') {
      return null;
    }

    const groups = Array.from(article.querySelectorAll('div[role="group"]'));
    for (const group of groups) {
      if (isBottomActionTree(group)) {
        return group;
      }

      const text = group.textContent || '';
      const hasButtons = group.querySelector('button, [role="button"]');
      if (hasButtons && text.length < 200) {
        return group;
      }
    }

    return article.querySelector('div[role="group"]') || article;
  }

  function ensureButtonMount(article) {
    let mount = article.querySelector('.xmd-actions');
    const headerPoint = findHeaderMountPoint(article);

    if (!mount) {
      mount = article.ownerDocument.createElement('div');
      mount.className = 'xmd-actions';
    }

    if (headerPoint && headerPoint.container) {
      mount.classList.add('xmd-actions--header');
      if (headerPoint.before) {
        headerPoint.container.insertBefore(mount, headerPoint.before);
      } else {
        headerPoint.container.appendChild(mount);
      }
      return mount;
    }

    mount.classList.remove('xmd-actions--header');

    if (!mount.parentElement) {
      const actionBar = getActionBar(article);
      if (actionBar && actionBar.parentElement) {
        actionBar.parentElement.insertBefore(mount, actionBar.nextSibling);
      } else {
        article.appendChild(mount);
      }
    }

    return mount;
  }

  function collectDomImages(article) {
    if (!article || typeof article.querySelectorAll !== 'function') {
      return [];
    }

    const imageAnchors = Array.from(article.querySelectorAll('a[href*="/photo/"]'));
    const seen = new Set();
    const images = [];

    imageAnchors.forEach((anchor, anchorIndex) => {
      const imageNodes = anchor.querySelectorAll('img[src*="pbs.twimg.com/media/"]');
      imageNodes.forEach((img) => {
        const src = img.getAttribute('src') || img.src || '';
        if (!src || seen.has(src)) {
          return;
        }

        seen.add(src);
        images.push({
          index: images.length || anchorIndex,
          rawUrl: src,
          type: 'photo',
        });
      });
    });

    return images;
  }

  function toAbsoluteUrl(rawUrl) {
    if (!rawUrl) {
      return '';
    }

    try {
      return new URL(rawUrl, globalScope.location?.origin || 'https://x.com').toString();
    } catch (error) {
      return rawUrl;
    }
  }

  const api = {
    extractTweetIdFromUrl,
    extractAuthorFromStatusUrl,
    findTweetArticles,
    extractTweetIdFromArticle,
    extractAuthorFromArticle,
    extractTweetTextFromArticle,
    findHeaderActionBar,
    getActionBar,
    ensureButtonMount,
    collectDomImages,
  };

  globalScope.XMDDomUtils = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
