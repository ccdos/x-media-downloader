# Chrome Web Store Submission Checklist

This document explains how to submit the current X Media Downloader build for Chrome Web Store review.

## Review build to upload
- ZIP file: `dist/x-media-downloader-0.1.0.zip`
- Generated from: `./scripts/build-release.sh`

## Store assets
Use these prepared assets in the dashboard:

- Screenshot: `assets/store-screenshot-1.png` (1280x800)
- Small promo tile: `assets/store-small-promo.png` (440x280)
- Marquee promo image: `assets/store-marquee.png` (1400x560)
- Extension icon: `assets/icon-128.png` (128x128)

## Public URLs
- Privacy policy: https://www.ccdos.cn/x-media-downloader/privacy-policy.html
- Support: https://www.ccdos.cn/x-media-downloader/support.html
- Homepage: https://github.com/ccdos/x-media-downloader

## Submission steps
1. Open the Chrome Web Store Developer Dashboard.
2. Create a new item.
3. Upload `dist/x-media-downloader-0.1.0.zip`.
4. Fill out the Store Listing form using `docs/chrome-web-store-listing.md`.
5. Upload the prepared screenshot and promo images from `assets/`.
6. Set:
   - Support URL: `https://www.ccdos.cn/x-media-downloader/support.html`
   - Homepage URL: `https://github.com/ccdos/x-media-downloader`
   - Privacy policy URL: `https://www.ccdos.cn/x-media-downloader/privacy-policy.html`
7. Fill out the Privacy section with the extension's single purpose and local-only data handling model.
8. Paste the review instructions from `docs/reviewer-test-instructions.md` into the reviewer instructions field.
9. Submit the item for review.

## Recommended form values
### Product name
`X Media Downloader`

### Short description
`Download images and videos directly from X / Twitter posts.`

### Category
`Productivity`

### Single purpose
`Add a download button to X / Twitter posts so users can download images and videos from the current post.`

## Privacy notes to keep consistent
Use wording consistent with the privacy policy:
- The extension processes visible post text locally to generate filenames.
- The extension intercepts X.com or Twitter GraphQL responses only to locate media URLs for the current post.
- The extension does not read, store, or transmit any other data from those GraphQL responses.
- The extension processes media URLs exposed by the current post in order to download selected media.
- Filename template preferences are stored locally using Chrome storage.
- The extension does not sell user data.
- The extension does not send user data to the developer or third-party analytics/advertising services.

## Reviewer instructions source
Use this file as the source of truth when filling the reviewer instructions field:
- `docs/reviewer-test-instructions.md`

## Important packaging note
This checklist is stored under `docs/` for repository documentation only.
It is intentionally excluded from the review ZIP because `scripts/build-release.sh` excludes the entire `docs/` directory from packaged release artifacts.
