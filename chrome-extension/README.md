# AgentNote Naver Listing Import Extension

Chrome extension for sending the currently open Naver Land detail panel to AgentNote.

The extension reads a page snapshot from the browser tab and opens AgentNote with that data attached to the URL hash. It does not depend on server-side crawling or the old Railway backend handoff API.

## Important

The production handoff target is:

```txt
https://agentnote.co.kr/?page=briefing&extension_import=1#import=<base64url-json>
```

If you need to test another app URL, update `APP_URL` in these files:

- `popup.js`
- `background.js`

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
4. AgentNote opens and imports the visible page snapshot.
5. Review the generated draft and missing fields, then save or export the brochure.

## Data Flow

1. `content.js` injects the floating "업무툴로 가져오기" button on Naver Land.
2. On click, it waits briefly for the dynamic detail panel and extracts visible text, key/value pairs, normalized parsed fields, missing fields, and image candidates.
3. `naverExtractor.js` normalizes the snapshot into `property`, `confidence`, and `missingFields`.
4. `background.js` opens AgentNote with `?page=briefing&extension_import=1#import=<payload>`.
5. AgentNote decodes the payload, switches to the briefing page, and `NaverImportPanel` maps the snapshot into editable form fields.

## Limits

- Naver page structure changes can still reduce extraction quality.
- The extension does not bypass login, captcha, or rate limits.
- It only reads the page the user is already viewing.
- Imported images are candidates. The user should confirm them because remote Naver images can still fail in PDF/CORS flows.

## Development

- Reload this extension on `chrome://extensions` after changing the code.
- The floating Naver-page button is the recommended flow.
- The popup is a fallback if the floating button is not visible.
