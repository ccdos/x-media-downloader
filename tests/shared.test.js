const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toOriginalImageUrl,
  chooseBestVideoVariant,
  buildDownloadFilename,
  sanitizeFileComponent,
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

  assert.equal(filename, 'x_hello-world_192837465_image_1.png');
});


test('buildDownloadFilename prefers sanitized post title when provided', () => {
  const filename = buildDownloadFilename({
    author: 'hello/world',
    tweetId: '192837465',
    kind: 'video',
    index: 1,
    url: 'https://video.twimg.com/tweet/demo.mp4',
    postTitle: '把4台 Mac mini 叠起来，用 CAD Skill 做 4 层竖向框架',
  });

  assert.equal(filename, 'x_hello-world_把4台-mac-mini-叠起来-用-cad-skill-做-4-层竖向框架_192837465_video_2.mp4');
});

test('sanitizeFileComponent strips invalid filename characters', () => {
  assert.equal(sanitizeFileComponent('a:b*c<d>e|f?g"h/i\\j'), 'a-b-c-d-e-f-g-h-i-j');
});
