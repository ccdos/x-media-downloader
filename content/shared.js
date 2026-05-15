(function initShared(globalScope) {
  const TWIMG_MEDIA_HOST = 'pbs.twimg.com';

  function sanitizeFileComponent(value) {
    return String(value || 'unknown')
      .normalize('NFKC')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'unknown';
  }

  function slugifyPostTitle(value) {
    return String(value || '')
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
  }

  function getExtensionFromUrl(rawUrl, fallback = 'bin') {
    try {
      const url = new URL(rawUrl);
      const format = url.searchParams.get('format');
      if (format) {
        return normalizeExtension(format);
      }

      const pathname = url.pathname || '';
      const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
      if (match) {
        return normalizeExtension(match[1]);
      }
    } catch (error) {
      return fallback;
    }

    return fallback;
  }

  function normalizeExtension(ext) {
    const value = String(ext || '').toLowerCase();
    if (!value) return 'bin';
    if (value === 'jpeg') return 'jpg';
    return value;
  }

  function toOriginalImageUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.hostname !== TWIMG_MEDIA_HOST || !url.pathname.includes('/media/')) {
        return rawUrl;
      }

      url.searchParams.set('name', 'orig');
      return url.toString();
    } catch (error) {
      return rawUrl;
    }
  }

  function chooseBestVideoVariant(variants = []) {
    const mp4s = variants
      .filter((variant) => variant && variant.url && variant.content_type === 'video/mp4')
      .sort((left, right) => (right.bitrate || 0) - (left.bitrate || 0));

    if (mp4s.length > 0) {
      return mp4s[0];
    }

    return variants.find((variant) => variant && variant.url) || null;
  }

  function buildDownloadFilename({ author, tweetId, kind, index, url, postTitle }) {
    const safeAuthor = sanitizeFileComponent(author || 'unknown');
    const safeTweetId = sanitizeFileComponent(tweetId || 'tweet');
    const safeKind = sanitizeFileComponent(kind || 'media');
    const safePostTitle = slugifyPostTitle(postTitle);
    const extension = getExtensionFromUrl(url, kind === 'video' ? 'mp4' : 'jpg');

    if (safePostTitle) {
      return `x_${safeAuthor}_${safePostTitle}_${safeTweetId}_${safeKind}_${Number(index || 0) + 1}.${extension}`;
    }

    return `x_${safeAuthor}_${safeTweetId}_${safeKind}_${Number(index || 0) + 1}.${extension}`;
  }

  const api = {
    sanitizeFileComponent,
    slugifyPostTitle,
    getExtensionFromUrl,
    toOriginalImageUrl,
    chooseBestVideoVariant,
    buildDownloadFilename,
  };

  globalScope.XMDShared = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
