# Real Estate Listing Importer Extension

Chrome extension for sending the currently open Naver Land detail panel to the real estate work app.

The extension reads a page snapshot from the browser tab and opens the Vercel app with that data attached to the URL hash. It does not depend on the old Railway backend handoff API.

## Important

After deploying the app to Vercel, update `APP_URL` in these files if the Vercel URL is different:

- `popup.js`
- `background.js`

Example:

```js
const APP_URL = "https://your-vercel-app.vercel.app";
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

## Notes

- Reload this extension on `chrome://extensions` after changing the code.
- The floating Naver-page button is the recommended flow.
- The popup is a fallback if the floating button is not visible.
