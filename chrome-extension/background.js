const APP_URL = "https://real-estate-mvp.vercel.app";

function makeCompactSnapshot(snapshot) {
  return {
    listing_url: snapshot?.listing_url || "",
    title: snapshot?.title || "",
    page_title: snapshot?.page_title || "",
    pairs: (snapshot?.pairs || []).slice(0, 80),
    images: (snapshot?.images || [])
      .slice(0, 8)
      .map((image) => ({
        url: image?.url || "",
        alt: image?.alt || "",
        source: image?.source || "extension",
        width: Number.isFinite(Number(image?.width)) ? Math.round(Number(image.width)) : 0,
        height: Number.isFinite(Number(image?.height)) ? Math.round(Number(image.height)) : 0,
      }))
      .filter((image) => image.url),
    visible_text: String(snapshot?.visible_text || "").slice(0, 7000),
    focused_text: String(snapshot?.focused_text || snapshot?.visible_text || "").slice(0, 7000),
    panel_texts: (snapshot?.panel_texts || []).slice(0, 4),
    parsed_fields: snapshot?.parsed_fields || {},
  };
}

function encodeSnapshotPayload(snapshot) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sendSnapshotToApp(snapshot) {
  const compactSnapshot = makeCompactSnapshot(snapshot);
  const payload = encodeSnapshotPayload(compactSnapshot);
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
        error: err?.message || "업무툴로 매물 정보를 보내지 못했습니다.",
      });
    });

  return true;
});
