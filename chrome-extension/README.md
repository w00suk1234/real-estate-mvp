# Real Estate Listing Importer Extension

Chrome Manifest V3 extension for sending the currently open Naver Land page to the real estate work app.

The extension injects a floating button into Naver Land pages:

```text
업무툴로 가져오기
```

Clicking that button sends a page snapshot, not only a URL:

- Current page URL
- Visible title and text
- Table-like key/value data found in the page
- Image candidates from `img`, Open Graph metadata, and background images

This avoids the slower fallback where the Railway server tries to open Naver Land directly.

## Install Locally

1. Open this URL in Chrome:

```text
chrome://extensions
```

2. Enable Developer mode.
3. Click "Load unpacked".
4. Select this folder:

```text
chrome-extension
```

## Use

1. Open a Naver Land page in Chrome.
2. Click a listing so the detail panel is visible.
3. Click the floating "업무툴로 가져오기" button on the Naver page.
4. The work app opens and imports the visible page snapshot.
5. Review the generated draft, then apply it to the brochure form.

## Notes

- If the extension was already loaded, click the reload button on `chrome://extensions` after pulling new code.
- The app still requires login before importing and saving listing data.
- The popup remains as a fallback, but the floating Naver-page button is the recommended flow.
- Server-side Naver import remains as a fallback, but the extension snapshot path is the recommended MVP path.
