const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toOriginalImageUrl,
  chooseBestVideoVariant,
  buildDownloadFilename,
  sanitizeFileComponent,
  resolveFilenameTemplateOptions,
  resolveDownloadOptions,
  applyDownloadSubdirectory,
  shouldUseDownloadSubdirectory,
} = require('../content/shared.js');

test('toOriginalImageUrl upgrades twimg media URLs to original quality', () => {
  const input = 'https://pbs.twimg.com/media/AbCdEf?format=jpg&name=small';
  const output = toOriginalImageUrl(input);

  assert.equal(
    output,
    'https://pbs.twimg.com/media/AbCdEf?format=jpg&name=orig'
  );
});

test('toOriginalImageUrl keeps non-twimg URLs unchanged', () => {
  const input = 'https://example.com/demo.jpg';
  assert.equal(toOriginalImageUrl(input), input);
});

test('chooseBestVideoVariant prefers highest bitrate mp4', () => {
  const variant = chooseBestVideoVariant([
    {
      url: 'https://video.twimg.com/demo-low.mp4',
      content_type: 'video/mp4',
      bitrate: 832000,
    },
    {
      url: 'https://video.twimg.com/demo-high.mp4',
      content_type: 'video/mp4',
      bitrate: 2176000,
    },
    {
      url: 'https://video.twimg.com/demo.m3u8',
      content_type: 'application/x-mpegURL',
    },
  ]);

  assert.equal(variant.url, 'https://video.twimg.com/demo-high.mp4');
});

test('buildDownloadFilename generates stable readable names', () => {
  const filename = buildDownloadFilename({
    author: 'hello/world',
    tweetId: '192837465',
    kind: 'image',
    index: 0,
    url: 'https://pbs.twimg.com/media/AbCdEf?format=png&name=orig',
  });

  assert.equal(filename, 'x_image_1.png');
});


test('buildDownloadFilename prefers sanitized post title when provided', () => {
  const filename = buildDownloadFilename({
    author: 'hello/world',
    tweetId: '192837465',
    kind: 'video',
    index: 1,
    url: 'https://video.twimg.com/tweet/demo.mp4',
    postTitle: 'Stack 4 Mac mini units vertically using CAD Skill to design a 4-level frame',
  });

  assert.equal(filename, 'x_stack-4-mac-mini-units-vertically-using-cad-skill-to-design-a-4-level-frame_video_2.mp4');
});


test('resolveFilenameTemplateOptions defaults to templates without author', () => {
  assert.deepEqual(resolveFilenameTemplateOptions(), {
    primaryTemplate: 'x_{postTitle}_{kind}_{index}.{ext}',
    fallbackTemplate: 'x_{kind}_{index}.{ext}',
  });
});

test('resolveDownloadOptions defaults to no subdirectory', () => {
  assert.deepEqual(resolveDownloadOptions(), {
    downloadSubdirectory: '',
    downloadMode: 'subdirectory',
  });
});

test('resolveDownloadOptions trims and sanitizes the download subdirectory', () => {
  assert.deepEqual(resolveDownloadOptions({
    downloadSubdirectory: '  favorites\\2026/../clips  ',
  }), {
    downloadSubdirectory: 'favorites/2026/clips',
    downloadMode: 'subdirectory',
  });
});

test('resolveDownloadOptions accepts ask mode and preserves the sanitized subdirectory value', () => {
  assert.deepEqual(resolveDownloadOptions({
    downloadMode: 'ask',
    downloadSubdirectory: ' favorites/2026 ',
  }), {
    downloadSubdirectory: 'favorites/2026',
    downloadMode: 'ask',
  });
});

test('shouldUseDownloadSubdirectory is disabled in ask mode', () => {
  assert.equal(shouldUseDownloadSubdirectory({ downloadMode: 'ask', downloadSubdirectory: 'favorites' }), false);
  assert.equal(shouldUseDownloadSubdirectory({ downloadMode: 'subdirectory', downloadSubdirectory: 'favorites' }), true);
});

test('applyDownloadSubdirectory prefixes the filename with the saved subdirectory', () => {
  assert.equal(
    applyDownloadSubdirectory('x_image_1.png', 'favorites/2026'),
    'favorites/2026/x_image_1.png'
  );
});

test('applyDownloadSubdirectory keeps nested filename templates under the saved subdirectory', () => {
  assert.equal(
    applyDownloadSubdirectory('downloads/123_image_1.png', 'favorites'),
    'favorites/downloads/123_image_1.png'
  );
});

test('buildDownloadFilename applies custom primary and fallback templates', () => {
  const primaryFilename = buildDownloadFilename({
    author: 'hello/world',
    tweetId: '192837465',
    kind: 'video',
    index: 1,
    url: 'https://video.twimg.com/tweet/demo.mp4',
    postTitle: 'Stack 4 Mac mini units vertically using CAD Skill to design a 4-level frame',
    templates: {
      primaryTemplate: 'x_{author}_{postTitle}_{tweetId}_{kind}_{index}.{ext}',
      fallbackTemplate: 'x_{author}_{tweetId}_{kind}_{index}.{ext}',
    },
  });

  const fallbackFilename = buildDownloadFilename({
    author: 'hello/world',
    tweetId: '192837465',
    kind: 'video',
    index: 1,
    url: 'https://video.twimg.com/tweet/demo.mp4',
    postTitle: '',
    templates: {
      primaryTemplate: 'x_{author}_{postTitle}_{tweetId}_{kind}_{index}.{ext}',
      fallbackTemplate: 'x_{author}_{tweetId}_{kind}_{index}.{ext}',
    },
  });

  assert.equal(primaryFilename, 'x_hello-world_stack-4-mac-mini-units-vertically-using-cad-skill-to-design-a-4-level-frame_192837465_video_2.mp4');
  assert.equal(fallbackFilename, 'x_hello-world_192837465_video_2.mp4');
});

test('sanitizeFileComponent strips invalid filename characters', () => {
  assert.equal(sanitizeFileComponent('a:b*c<d>e|f?g"h/i\\j'), 'a-b-c-d-e-f-g-h-i-j');
});
