const test = require('node:test');
const assert = require('node:assert/strict');

const { extractMediaEntries } = require('../content/media-extractor.js');

test('extractMediaEntries pulls photo and best video from tweet payload', () => {
  const payload = {
    data: {
      threaded_conversation_with_injections_v2: {
        instructions: [
          {
            entries: [
              {
                content: {
                  itemContent: {
                    tweet_results: {
                      result: {
                        __typename: 'Tweet',
                        rest_id: '1234567890',
                        core: {
                          user_results: {
                            result: {
                              legacy: {
                                screen_name: 'demo_user',
                              },
                            },
                          },
                        },
                        legacy: {
                          extended_entities: {
                            media: [
                              {
                                type: 'photo',
                                media_url_https: 'https://pbs.twimg.com/media/Photo01?format=jpg&name=small',
                              },
                              {
                                type: 'video',
                                video_info: {
                                  variants: [
                                    {
                                      content_type: 'video/mp4',
                                      bitrate: 832000,
                                      url: 'https://video.twimg.com/video-low.mp4',
                                    },
                                    {
                                      content_type: 'video/mp4',
                                      bitrate: 2176000,
                                      url: 'https://video.twimg.com/video-high.mp4',
                                    },
                                  ],
                                },
                              },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    },
  };

  const entries = extractMediaEntries(payload);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].tweetId, '1234567890');
  assert.equal(entries[0].author, 'demo_user');
  assert.equal(entries[0].images[0].url, 'https://pbs.twimg.com/media/Photo01?format=jpg&name=orig');
  assert.equal(entries[0].videos[0].bestUrl, 'https://video.twimg.com/video-high.mp4');
});

test('extractMediaEntries merges duplicate tweet nodes without duplicating media', () => {
  const tweetNode = {
    rest_id: '222',
    legacy: {
      extended_entities: {
        media: [
          {
            type: 'photo',
            media_url_https: 'https://pbs.twimg.com/media/Dupe01?format=png&name=small',
          },
        ],
      },
    },
  };

  const payload = {
    a: tweetNode,
    b: JSON.parse(JSON.stringify(tweetNode)),
  };

  const entries = extractMediaEntries(payload);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].images.length, 1);
});
