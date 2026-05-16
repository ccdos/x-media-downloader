# X Media Downloader

A minimal Chrome Manifest V3 extension that inserts a single media download button into the top-right action area of posts on x.com / twitter.com.

Architecture:
- The content script watches the page, finds posts, and mounts the download button.
- An injected page hook intercepts the page's own GraphQL/XHR responses and extracts tweet media metadata.
- The background service worker calls the Downloads API to start downloads.

Privacy and data handling:
- This extension does not collect, store, or transmit user data to the developer. All processing happens locally in the browser.
- The extension intercepts X.com or Twitter GraphQL responses only to obtain media URLs that already belong to the current post.
- The extension does not read, store, or transmit any other data from those responses.
- Filename template preferences are stored locally in Chrome storage.

Implementation disclosure:
- To make downloads reliable on X / Twitter, the extension injects a page hook that intercepts X.com and Twitter GraphQL/XHR responses.
- The hook extracts only post media URLs and passes them back to the content script for local download handling.
- It does not send the intercepted response data to any external service.

Project structure:
- manifest.json
- background/service-worker.js
- content/shared.js
- content/dom-utils.js
- content/media-extractor.js
- content/inject.js
- content/content.js
- content/styles.css
- options/options.html
- options/options.css
- options/options.js
- tests/*.test.js

Installation:
1. Open Chrome -> Extensions -> Manage Extensions.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the project folder that contains this extension's manifest.json file (for example, the cloned x-media-downloader repository directory).

Usage:
1. Open any post on x.com or twitter.com, either from the timeline or a post detail page.
2. After the page finishes loading, a single download button appears in the top-right action area of posts that contain media.
3. Click the button once to download all available media from the current post (images and/or videos).
4. Filenames prefer a short title derived from post text and do not include {author} or {tweetId} by default. When no usable post text is available, filenames fall back to kind + index.
5. Open Extension options from the extension details page to customize the primary and fallback filename templates and review the available template fields.

Responsible use:
- This extension is intended for personal use on media that the user is already allowed to view on X / Twitter.
- Users are responsible for complying with the X / Twitter Terms of Service and any applicable copyright, privacy, or platform rules.

Tests:
- Run from the project directory: npm test

Current limitations:
- Video downloads prefer the highest bitrate MP4. If the page only exposes m3u8, this version does not transcode it.
- X frequently changes its DOM structure, so the mount position may need future adjustments.
- If restricted media metadata is not actually returned by the page, the extension will not fake a download.

Suggested next steps:
- Add popup/options controls for saveAs, filename templates, and quality preferences.
- Add dedicated handling for quoted-post and repost media.
- Make action bar detection even more resilient.
