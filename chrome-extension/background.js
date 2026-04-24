const APP_URL = "https://real-estate-mvp-production.up.railway.app";

function makeCompactSnapshot(snapshot) {
  return {
    listing_url: snapshot?.listing_url || "",
    title: snapshot?.title || "",
    page_title: snapshot?.page_title || "",
    pairs: (snapshot?.pairs || []).slice(0, 80),
    images: (snapshot?.images || [])
      .slice(0, 6)
      .map((image) => ({
        url: image?.url || "",
        alt: image?.alt || "",
        source: image?.source || "extension",
        width: Number.isFinite(Number(image?.width)) ? Math.round(Number(image.width)) : 0,
        height: Number.isFinite(Number(image?.height)) ? Math.round(Number(image.height)) : 0,
      }))
      .filter((image) => image.url),
    visible_text: String(snapshot?.visible_text || "").slice(0, 6000),
    focused_text: String(
      snapshot?.focused_text || snapshot?.visible_text || ""
    ).slice(0, 6000),
    panel_texts: (snapshot?.panel_texts || []).slice(0, 4),
    parsed_fields: snapshot?.parsed_fields || {},
  };
}

async function sendSnapshotToApp(snapshot) {
  const compactSnapshot = makeCompactSnapshot(snapshot);
  const response = await fetch(`${APP_URL}/import/extension-handoff`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(compactSnapshot),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "확장 전달 데이터를 서버에 저장하지 못했습니다.");
  }

  const data = await response.json();
  if (!data?.handoff_id) {
    throw new Error("확장 전달 ID를 만들지 못했습니다.");
  }

  const targetUrl = `${APP_URL}/?extension_import=1&handoff_id=${encodeURIComponent(
    data.handoff_id
  )}`;
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
