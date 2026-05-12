const APP_URL = "https://agentnote.co.kr";

function makeCompactSnapshot(snapshot) {
  const property = snapshot?.property && typeof snapshot.property === "object" ? snapshot.property : null;
  const confidence = snapshot?.confidence && typeof snapshot.confidence === "object" ? snapshot.confidence : null;
  return {
    listing_url: snapshot?.listing_url || "",
    title: snapshot?.title || "",
    page_title: snapshot?.page_title || "",
    source: snapshot?.source || "naver_real_estate",
    sourceUrl: snapshot?.sourceUrl || snapshot?.listing_url || "",
    importedAt: snapshot?.importedAt || new Date().toISOString(),
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
    confidence,
    property,
    missingFields: Array.isArray(snapshot?.missingFields) ? snapshot.missingFields.slice(0, 20) : [],
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
  const targetUrl = `${APP_URL}/?page=briefing&extension_import=1#import=${payload}`;
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
        error: err?.message || "???? ?? ??? ??? ?????.",
      });
    });

  return true;
});
