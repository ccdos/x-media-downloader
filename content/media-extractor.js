(function initMediaExtractor(globalScope) {
  const shared = globalScope.XMDShared || (typeof require === 'function' ? require('./shared.js') : null);

  if (!shared) {
    throw new Error('XMDShared is required before loading media-extractor.js');
  }

  const { toOriginalImageUrl, chooseBestVideoVariant } = shared;

  function extractMediaEntries(payload) {
    const results = new Map();
    const seen = new WeakSet();

    walk(payload, (node) => {
      const tweet = normalizeTweetNode(node);
      if (!tweet || !tweet.tweetId) {
        return;
      }

      const existing = results.get(tweet.tweetId) || {
        tweetId: tweet.tweetId,
        author: tweet.author || 'unknown',
        images: [],
        videos: [],
      };

      if (!existing.author || existing.author === 'unknown') {
        existing.author = tweet.author || existing.author;
      }

      mergeImages(existing.images, tweet.images);
      mergeVideos(existing.videos, tweet.videos);
      results.set(tweet.tweetId, existing);
    }, seen);

    return Array.from(results.values()).filter((entry) => entry.images.length || entry.videos.length);
  }

  function walk(value, visitor, seen) {
    if (!value || typeof value !== 'object') {
      return;
    }

    if (seen.has(value)) {
      return;
    }
    seen.add(value);

    visitor(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, visitor, seen);
      }
      return;
    }

    for (const child of Object.values(value)) {
      walk(child, visitor, seen);
    }
  }

  function normalizeTweetNode(node) {
    if (!node || typeof node !== 'object') {
      return null;
    }

    const tweetId = extractTweetId(node);
    const media = extractMediaArray(node);

    if (!tweetId || media.length === 0) {
      return null;
    }

    const author = extractAuthor(node);
    const images = [];
    const videos = [];

    media.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        return;
      }

      if (item.type === 'photo') {
        const rawUrl = item.media_url_https || item.media_url;
        if (!rawUrl) {
          return;
        }

        images.push({
          index,
          url: toOriginalImageUrl(rawUrl),
          rawUrl,
          type: 'photo',
        });
        return;
      }

      if (item.type === 'video' || item.type === 'animated_gif') {
        const variants = Array.isArray(item.video_info?.variants) ? item.video_info.variants.filter(Boolean) : [];
        const bestVariant = chooseBestVideoVariant(variants);
        if (!bestVariant || !bestVariant.url) {
          return;
        }

        videos.push({
          index,
          type: item.type,
          bestUrl: bestVariant.url,
          posterUrl: item.media_url_https || item.media_url || '',
          variants,
        });
      }
    });

    return {
      tweetId,
      author,
      images,
      videos,
    };
  }

  function extractTweetId(node) {
    if (typeof node.rest_id === 'string' && /^\d+$/.test(node.rest_id)) {
      return node.rest_id;
    }

    if (typeof node.id_str === 'string' && /^\d+$/.test(node.id_str)) {
      return node.id_str;
    }

    if (typeof node.tweet_id === 'string' && /^\d+$/.test(node.tweet_id)) {
      return node.tweet_id;
    }

    return null;
  }

  function extractMediaArray(node) {
    const candidates = [
      node.legacy?.extended_entities?.media,
      node.legacy?.entities?.media,
      node.extended_entities?.media,
      node.entities?.media,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length > 0) {
        return candidate;
      }
    }

    return [];
  }

  function extractAuthor(node) {
    return (
      node.core?.user_results?.result?.legacy?.screen_name ||
      node.core?.user_results?.result?.core?.screen_name ||
      node.user_results?.result?.legacy?.screen_name ||
      node.legacy?.screen_name ||
      node.legacy?.user?.screen_name ||
      'unknown'
    );
  }

  function mergeImages(target, incoming) {
    const seen = new Set(target.map((item) => item.url));
    incoming.forEach((item) => {
      if (!seen.has(item.url)) {
        seen.add(item.url);
        target.push(item);
      }
    });
  }

  function mergeVideos(target, incoming) {
    const seen = new Set(target.map((item) => item.bestUrl));
    incoming.forEach((item) => {
      if (!seen.has(item.bestUrl)) {
        seen.add(item.bestUrl);
        target.push(item);
      }
    });
  }

  const api = {
    extractMediaEntries,
  };

  globalScope.XMDMediaExtractor = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
