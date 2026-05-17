# Chrome Web Store Listing Draft

## Product name
X Media Downloader

## Short description
Download images and videos directly from X / Twitter posts.

## Detailed description
X Media Downloader adds a compact download button to posts on x.com and twitter.com when the post contains downloadable media.

Features:
- Download all available media from a post with one click.
- Supports both images and videos.
- Hides the button when a post has no media.
- Generates readable filenames from visible post text.
- Lets you customize filename templates and an optional Downloads subfolder in the extension options page.
- Defaults to privacy-friendly filenames that do not include author handles or tweet IDs unless you opt in.
- Processes media metadata locally and does not transmit user data to the developer.

How it works:
- The extension detects supported posts on X / Twitter.
- It adds a single download button in the top-right action area of posts that contain media.
- Clicking the button downloads all media files currently available for that post.
- The extension intercepts X.com or Twitter GraphQL responses only to obtain media URLs for the current post. It does not read, store, or transmit any other data from those responses.
- Downloads are saved locally with the Chrome Downloads API inside the browser Downloads folder; users may optionally set a relative subfolder such as favorites/2026.

Notes:
- Video downloads prefer the highest bitrate MP4 variant when available.
- If X only exposes an HLS playlist instead of a downloadable MP4, this version does not transcode the stream.
- The extension only appears on posts that actually contain images or videos.
- The extension is intended for personal use on media the user is already permitted to access. Users are responsible for complying with the X / Twitter Terms of Service and applicable laws.

## Category
Productivity

## Support URL
https://www.ccdos.cn/x-media-downloader/support.html

## Homepage URL
https://github.com/ccdos/x-media-downloader

## Privacy policy URL
https://www.ccdos.cn/x-media-downloader/privacy-policy.html
