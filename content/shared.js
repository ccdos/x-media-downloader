(function initShared(globalScope) {
  const TWIMG_MEDIA_HOST = 'pbs.twimg.com';
  const DEFAULT_FILENAME_TEMPLATES = Object.freeze({
    primaryTemplate: 'x_{postTitle}_{kind}_{index}.{ext}',
    fallbackTemplate: 'x_{kind}_{index}.{ext}',
  });
  const DEFAULT_DOWNLOAD_OPTIONS = Object.freeze({
    downloadSubdirectory: '',
    downloadMode: 'subdirectory',
  });

  function sanitizeFileComponent(value) {
    return String(value || 'unknown')
      .normalize('NFKC')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\\+/g, '-')
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
    } catch (_error) {
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
    } catch (_error) {
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

  function resolveFilenameTemplateOptions(input = {}) {
    return {
      primaryTemplate: normalizeTemplate(input.primaryTemplate, DEFAULT_FILENAME_TEMPLATES.primaryTemplate),
      fallbackTemplate: normalizeTemplate(input.fallbackTemplate, DEFAULT_FILENAME_TEMPLATES.fallbackTemplate),
    };
  }

  function resolveDownloadOptions(input = {}) {
    return {
      downloadSubdirectory: normalizeDownloadSubdirectory(
        input.downloadSubdirectory,
        DEFAULT_DOWNLOAD_OPTIONS.downloadSubdirectory
      ),
      downloadMode: normalizeDownloadMode(input.downloadMode, DEFAULT_DOWNLOAD_OPTIONS.downloadMode),
    };
  }

  function normalizeTemplate(template, fallback) {
    const value = String(template || '').trim();
    return value || fallback;
  }

  function normalizeDownloadMode(value, fallback = 'subdirectory') {
    return value === 'ask' ? 'ask' : fallback;
  }

  function normalizeDownloadSubdirectory(value, fallback = '') {
    const raw = String(value || '').trim();
    if (!raw) {
      return fallback;
    }

    const parts = raw
      .replace(/\\+/g, '/')
      .split('/')
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .filter((part) => part !== '.' && part !== '..')
      .map((part) => sanitizePathPart(part));

    return parts.join('/');
  }

  function buildDownloadFilename({ author, tweetId, kind, index, url, postTitle, templates }) {
    const safeAuthor = sanitizeFileComponent(author || 'unknown');
    const safeTweetId = sanitizeFileComponent(tweetId || 'tweet');
    const safeKind = sanitizeFileComponent(kind || 'media');
    const safePostTitle = slugifyPostTitle(postTitle);
    const extension = getExtensionFromUrl(url, kind === 'video' ? 'mp4' : 'jpg');
    const safeIndex = String(Number(index || 0) + 1);
    const templateOptions = resolveFilenameTemplateOptions(templates || DEFAULT_FILENAME_TEMPLATES);
    const tokens = {
      author: safeAuthor,
      tweetId: safeTweetId,
      kind: safeKind,
      index: safeIndex,
      ext: extension,
      postTitle: safePostTitle,
    };

    const primary = applyFilenameTemplate(templateOptions.primaryTemplate, tokens);
    if (safePostTitle && templateOptions.primaryTemplate.includes('{postTitle}')) {
      return primary;
    }

    return applyFilenameTemplate(templateOptions.fallbackTemplate, tokens);
  }

  function applyFilenameTemplate(template, tokens) {
    const rendered = String(template || '').replace(/\{(author|tweetId|kind|index|ext|postTitle)\}/g, (_match, token) => tokens[token] || '');
    return sanitizeRenderedFilename(rendered, tokens.ext);
  }

  function applyDownloadSubdirectory(filename, downloadSubdirectory) {
    const normalizedSubdirectory = normalizeDownloadSubdirectory(downloadSubdirectory, '');
    const normalizedFilename = sanitizeRenderedFilename(filename, 'bin');
    if (!normalizedSubdirectory) {
      return normalizedFilename;
    }
    return `${normalizedSubdirectory}/${normalizedFilename}`;
  }

  function shouldUseDownloadSubdirectory(options = {}) {
    const normalized = resolveDownloadOptions(options);
    return normalized.downloadMode === 'subdirectory' && Boolean(normalized.downloadSubdirectory);
  }

  function sanitizeRenderedFilename(value, fallbackExt) {
    const trimmed = String(value || '')
      .replace(/\/+/g, '/')
      .replace(/^\/+|\/+$/g, '')
      .trim();

    const parts = trimmed.split('/').filter(Boolean).map((part) => sanitizeFilenameSegment(part));
    const joined = parts.join('/');
    if (joined) {
      return joined;
    }

    return `x-media.${fallbackExt || 'bin'}`;
  }

  function sanitizeFilenameSegment(value) {
    const extMatch = String(value).match(/^(.*?)(\.([a-zA-Z0-9]+))?$/);
    const stem = sanitizePathPart(extMatch?.[1] || value);
    const ext = extMatch?.[3] ? normalizeExtension(extMatch[3]) : '';
    return ext ? `${stem}.${ext}` : stem;
  }

  function sanitizePathPart(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/[\\:*?"<>|]+/g, '-')
      .replace(/\\+/g, '-')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/-+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '') || 'x-media';
  }

  const api = {
    DEFAULT_FILENAME_TEMPLATES,
    DEFAULT_DOWNLOAD_OPTIONS,
    sanitizeFileComponent,
    slugifyPostTitle,
    getExtensionFromUrl,
    toOriginalImageUrl,
    chooseBestVideoVariant,
    resolveFilenameTemplateOptions,
    resolveDownloadOptions,
    buildDownloadFilename,
    applyDownloadSubdirectory,
    shouldUseDownloadSubdirectory,
  };

  globalScope.XMDShared = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
