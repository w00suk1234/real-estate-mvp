const BUTTON_ID = "real-estate-mvp-import-button";
const STATUS_ID = "real-estate-mvp-import-status";

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function absoluteUrl(value) {
  try {
    return new URL(value, location.href).href;
  } catch {
    return "";
  }
}

function collectNaverSnapshot() {
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

function showStatus(message, isError = false) {
  let status = document.getElementById(STATUS_ID);
  if (!status) {
    status = document.createElement("div");
    status.id = STATUS_ID;
    document.documentElement.appendChild(status);
  }

  status.textContent = message;
  Object.assign(status.style, {
    position: "fixed",
    right: "24px",
    bottom: "86px",
    zIndex: "2147483647",
    maxWidth: "320px",
    padding: "11px 14px",
    borderRadius: "12px",
    color: isError ? "#991b1b" : "#0f172a",
    background: isError ? "#fee2e2" : "#ecfeff",
    border: `1px solid ${isError ? "#fecaca" : "#a5f3fc"}`,
    boxShadow: "0 16px 36px rgba(15, 23, 42, 0.18)",
    fontSize: "13px",
    fontWeight: "700",
    lineHeight: "1.4",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  });

  window.setTimeout(() => {
    status?.remove();
  }, 4200);
}

async function handleImportClick(button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "읽는 중...";

  try {
    const snapshot = collectNaverSnapshot();
    if (!snapshot.visible_text || snapshot.visible_text.length < 100) {
      throw new Error("현재 네이버 화면에서 읽을 내용이 너무 적습니다. 매물 상세 패널을 먼저 열어주세요.");
    }

    const response = await chrome.runtime.sendMessage({
      type: "IMPORT_NAVER_SNAPSHOT",
      snapshot,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "업무툴로 보내지 못했습니다.");
    }

    showStatus(
      `업무툴로 보냈습니다. 필드 ${snapshot.pairs.length}개, 이미지 ${snapshot.images.length}개를 전달했습니다.`
    );
  } catch (err) {
    console.error(err);
    showStatus(err?.message || "매물 가져오기에 실패했습니다.", true);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function injectImportButton() {
  if (!document.body || document.getElementById(BUTTON_ID)) return;

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = "업무툴로 가져오기";
  button.title = "현재 네이버 매물 화면을 부동산 업무툴 소개서 작성 폼으로 보냅니다.";

  Object.assign(button.style, {
    position: "fixed",
    right: "24px",
    bottom: "24px",
    zIndex: "2147483647",
    border: "0",
    borderRadius: "999px",
    padding: "14px 18px",
    color: "#ffffff",
    background: "linear-gradient(135deg, #0058be, #003f8c)",
    boxShadow: "0 18px 40px rgba(0, 88, 190, 0.32)",
    fontSize: "15px",
    fontWeight: "900",
    letterSpacing: "0",
    cursor: "pointer",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  });

  button.addEventListener("click", () => handleImportClick(button));
  document.body.appendChild(button);
}

injectImportButton();

const observer = new MutationObserver(() => injectImportButton());
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});
