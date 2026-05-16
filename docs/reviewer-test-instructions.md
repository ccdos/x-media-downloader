# Reviewer Test Instructions

## Extension purpose
X Media Downloader adds a download button to X / Twitter posts that contain downloadable images or videos.

## Test setup
1. Load the unpacked extension from this repository, or install the review build zip.
2. Open x.com or twitter.com.
3. Sign in if required for the test posts you choose.

## Functional test steps
1. Open a post that contains one or more images.
   - Expected: a single download button appears in the top-right action area of the post.
   - Expected: clicking the button downloads the image files.

2. Open a post that contains a video.
   - Expected: a single download button appears in the same area.
   - Expected: clicking the button downloads the best available MP4 video variant when X exposes one.

3. Open a post that contains no images or videos.
   - Expected: no download button is shown.

4. Open the extension options page.
   - Expected: the options page shows primary and fallback filename template fields.
   - Expected: the page documents the available template fields and their meanings.
   - Expected: clicking Save stores changes; clicking Reset to defaults restores the default templates.

## Data handling disclosure
- The extension injects a page hook that intercepts X.com or Twitter GraphQL responses only to locate media URLs for the current post.
- The extension does not read, store, or transmit any other data from those GraphQL responses.
- The extension does not send user data to the developer; all download logic runs locally in the browser.

## Responsible-use disclosure
- The extension is intended for personal use on media the user is already permitted to access.
- Users remain responsible for complying with the X / Twitter Terms of Service and any applicable copyright or privacy rules.

## Default filename behavior
- Primary template: x_{postTitle}_{kind}_{index}.{ext}
- Fallback template: x_{kind}_{index}.{ext}

## Permissions justification
- downloads: required to save the selected media file to disk.
- storage: required to store filename template preferences.
- x.com / twitter.com: required to detect posts and inject the button.
- *.twimg.com / video.twimg.com: required to download the media that belongs to the current post.
