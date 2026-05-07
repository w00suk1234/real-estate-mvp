const APP_URL = "https://agentnote.co.kr";
const NAVER_LAND_URL = "https://new.land.naver.com/";

function isNaverLandUrl(url) {
  return /^https:\/\/(?:fin\.|new\.)?land\.naver\.com\//i.test(url || "");
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setError(message) {
  document.getElementById("error").textContent = message || "";
}

function setStatus(message) {
  const box = document.getElementById("current-url");
  box.textContent = message || "";
}

function collectNaverSnapshot() {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const absoluteUrl = (value) => {
    try {
      return new URL(value, location.href).href;
    } catch {
      return "";
    }
  };

  const pairs = [];
  const addPair = (key, value) => {
    const cleanKey = normalize(key).replace(/:$/, "");
    const cleanValue = normalize(value);
    if (!cleanKey || !cleanValue || cleanKey.length > 80 || cleanValue.length > 500) return;
    if (pairs.some((pair) => pair.key === cleanKey && pair.value === cleanValue)) return;
    pairs.push({ key: cleanKey, value: cleanValue });
  };

  document.querySelectorAll("tr").forEach((row) => {
    const cells = Array.from(row.querySelectorAll("th,td")).map((cell) =>
      normalize(cell.innerText)
    );
    for (let index = 0; index < cells.length - 1; index += 2) {
      addPair(cells[index], cells[index + 1]);
    }
  });

  document.querySelectorAll("dl").forEach((list) => {
    const terms = Array.from(list.querySelectorAll("dt"));
    const descriptions = Array.from(list.querySelectorAll("dd"));
    terms.forEach((term, index) => {
      addPair(term.innerText, descriptions[index]?.innerText);
    });
  });

  document
    .querySelectorAll("[class*='info'], [class*='detail'], [class*='article'], li")
    .forEach((node) => {
      const text = normalize(node.innerText);
      if (!text || text.length > 180) return;
      const match = text.match(/^([^:]{2,30}):\s*(.{1,140})$/);
      if (match) addPair(match[1], match[2]);
    });

  const metaTitle = document.querySelector("meta[property='og:title']")?.content || "";
  const title =
    normalize(document.querySelector("h1")?.innerText) ||
    normalize(metaTitle) ||
    normalize(document.title);

  const imageMap = new Map();
  const addImage = (url, alt = "", source = "extension", width = 0, height = 0) => {
    const cleanUrl = absoluteUrl(url);
    if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) return;
    if (cleanUrl.startsWith("data:")) return;
    if (cleanUrl.includes("sp_") || cleanUrl.includes("sprite")) return;
    if (!imageMap.has(cleanUrl)) {
      imageMap.set(cleanUrl, {
        url: cleanUrl,
        alt: normalize(alt),
        source,
        width: Number(width) || 0,
        height: Number(height) || 0,
      });
    }
  };

  addImage(document.querySelector("meta[property='og:image']")?.content, "og:image", "meta");

  document.querySelectorAll("img").forEach((image) => {
    addImage(
      image.currentSrc || image.src || image.dataset.src || image.getAttribute("data-src"),
      image.alt,
      "img",
      image.naturalWidth || image.width,
      image.naturalHeight || image.height
    );
  });

  document.querySelectorAll("[style*='background']").forEach((node) => {
    const style = node.getAttribute("style") || "";
    const matches = style.matchAll(/url\(["']?([^"')]+)["']?\)/g);
    for (const match of matches) {
      addImage(match[1], "", "background");
    }
  });

  return {
    listing_url: location.href,
    title,
    page_title: normalize(document.title),
    pairs: pairs.slice(0, 120),
    images: Array.from(imageMap.values()).slice(0, 40),
    visible_text: normalize(document.body?.innerText || "").slice(0, 12000),
  };
}

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

async function renderCurrentUrl() {
  const tab = await getActiveTab();
  const url = tab?.url || "";
  setStatus(url || "Could not read the current tab URL.");
  if (!isNaverLandUrl(url)) {
    setError("Open a Naver Land page first, then click this extension.");
  }
}

document.getElementById("send").addEventListener("click", async () => {
  try {
    setError("");
    setStatus("Reading the current Naver page...");

    const tab = await getActiveTab();
    const currentUrl = tab?.url || "";

    if (!isNaverLandUrl(currentUrl)) {
      setError("Please run this on a Naver Land page.");
      return;
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectNaverSnapshot,
    });

    const snapshot = result?.result;
    if (!snapshot?.listing_url) {
      setError("Could not read the current Naver page. Refresh Naver and try again.");
      return;
    }

    setStatus(`Found ${snapshot.pairs.length} fields and ${snapshot.images.length} image candidates.`);
    await sendSnapshotToApp(snapshot);
  } catch (err) {
    console.error(err);
    setError(err.message || "Failed to send this listing to the app.");
  }
});

document.getElementById("open-naver").addEventListener("click", async () => {
  await chrome.tabs.create({ url: NAVER_LAND_URL });
});

renderCurrentUrl();
