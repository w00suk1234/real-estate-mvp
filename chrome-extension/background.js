const APP_URL = "https://real-estate-mvp-production.up.railway.app";

function makeCompactSnapshot(snapshot) {
  return {
    listing_url: snapshot?.listing_url || "",
    title: snapshot?.title || "",
    page_title: snapshot?.page_title || "",
    pairs: (snapshot?.pairs || []).slice(0, 80),
    images: (snapshot?.images || []).slice(0, 12),
    visible_text: String(snapshot?.visible_text || "").slice(0, 6000),
    focused_text: String(snapshot?.focused_text || snapshot?.visible_text || "").slice(0, 6000),
    panel_texts: (snapshot?.panel_texts || []).slice(0, 4),
    parsed_fields: snapshot?.parsed_fields || {},
  };
}

function encodePayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.slice(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sendSnapshotToApp(snapshot) {
  const compactSnapshot = makeCompactSnapshot(snapshot);
  const payload = encodePayload(compactSnapshot);
  const targetUrl = `${APP_URL}/?extension_import=1#snapshot=${payload}`;
  await chrome.tabs.create({ url: targetUrl });
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
