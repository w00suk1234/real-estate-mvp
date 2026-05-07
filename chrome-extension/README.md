# Real Estate Listing Importer Extension

Chrome extension for sending the currently open Naver Land detail panel to the real estate work app.

The extension reads a page snapshot from the browser tab and opens AgentNote with that data attached to the URL hash. It does not depend on server-side crawling or the old Railway backend handoff API.

## Important

The production handoff target is:

```txt
https://agentnote.co.kr/?page=briefing&extension_import=1#import=<base64url-json>
```

If you need to test another app URL, update `APP_URL` in these files:

- `popup.js`
- `background.js`

Example:

```js
const APP_URL = "https://agentnote.co.kr";
```

## Install Locally

1. Open `chrome://extensions` in Chrome.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select the `chrome-extension` folder.
5. Refresh the Naver Land tab after installing or reloading the extension.

## Use

1. Open a Naver Land page in Chrome.
2. Click a listing so the detail panel is visible.
3. Click the floating "업무툴로 가져오기" button on the Naver page.
4. The work app opens and imports the visible page snapshot.
5. Review the generated draft, then save or export the brochure.

## MVP Data Flow

1. The content script injects the floating "업무툴로 가져오기" button on Naver Land.
2. On click, it extracts visible detail-panel text, key/value pairs, basic parsed fields, and image candidates from the current DOM.
3. The background worker opens AgentNote with `?page=briefing&extension_import=1#import=<payload>`.
4. AgentNote decodes the payload, switches to the briefing page, and `NaverImportPanel` maps the snapshot into editable form fields.
5. Images are shown only as candidates for now. The user should still upload brochure images manually because remote Naver images can fail in PDF/CORS flows.

## Notes

- Reload this extension on `chrome://extensions` after changing the code.
- The floating Naver-page button is the recommended flow.
- The popup is a fallback if the floating button is not visible.
