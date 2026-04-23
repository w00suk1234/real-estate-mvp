const APP_URL = "https://real-estate-mvp-production.up.railway.app";

async function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 12000);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function sendSnapshotToApp(snapshot) {
  const targetUrl = `${APP_URL}/?extension_import=1`;
  const appTab = await chrome.tabs.create({ url: targetUrl });
  await waitForTabComplete(appTab.id);

  await chrome.scripting.executeScript({
    target: { tabId: appTab.id },
    args: [snapshot],
    func: (payload) => {
      sessionStorage.setItem("naver_import_snapshot", JSON.stringify(payload));
      window.location.replace("/?extension_import=1");
    },
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "IMPORT_NAVER_SNAPSHOT") return false;

  sendSnapshotToApp(message.snapshot)
    .then(() => sendResponse({ ok: true }))
    .catch((err) => {
      console.error(err);
      sendResponse({
        ok: false,
        error: err?.message || "Failed to send listing to the work app.",
      });
    });

  return true;
});
