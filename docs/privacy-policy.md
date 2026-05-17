# Privacy Policy

Effective date: 2026-05-16

X Media Downloader is designed to download media that is already visible to the user on x.com and twitter.com.

## What the extension does
- Detects posts that contain downloadable images or videos.
- Adds a download button to supported posts.
- Generates filenames locally from post text and extension settings.
- Stores filename template settings and an optional download subdirectory locally with the Chrome storage API.

## Data collection and storage
X Media Downloader does not operate a backend service and does not transmit user data to the developer. It does not collect, store, or transmit user data outside the browser, and all media-download logic runs locally.

The extension processes the following data locally inside the browser:
- Visible post text, only to generate optional filename titles.
- Media URLs exposed by the page, only to download the selected media.
- X.com or Twitter GraphQL response data, only to locate media URLs for the current post.
- User-defined filename template preferences and the optional download subdirectory, stored locally in Chrome storage.

The extension intercepts X.com or Twitter GraphQL responses only to obtain media URLs for the current post. It does not read, store, or transmit any other data from those responses.

The extension does not:
- Sell user data.
- Transfer personal information to third-party analytics or advertising services.
- Use remote code.
- Collect browsing history outside supported X/Twitter pages.

## Permissions explained
- downloads: saves selected media files to the user's device inside the browser Downloads folder or one of its subfolders.
- storage: stores filename template preferences and the optional download subdirectory locally.
- x.com / twitter.com: detects supported posts and inserts the download button.
- *.twimg.com / video.twimg.com: accesses original image and video files that belong to the current post.

## Responsible use
The extension is intended for personal use on media the user is already permitted to access. Users are responsible for complying with the X / Twitter Terms of Service and applicable laws.

## Contact
For support or privacy questions, open an issue in the GitHub repository:
https://www.ccdos.cn/x-media-downloader/support.html
