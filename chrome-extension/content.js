const BUTTON_ID = "agentnote-naver-import-button";
const STATUS_ID = "agentnote-naver-import-status";
const DETAIL_READY_TIMEOUT_MS = 8000;

const DETAIL_KEYWORDS = [
  "매매",
  "전세",
  "월세",
  "보증금",
  "관리비",
  "주소",
  "소재지",
  "면적",
  "공급",
  "전용",
  "층수",
  "주차",
  "엘리베이터",
  "입주",
  "방향",
  "매물특징",
  "매물정보",
];

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeLines(value) {
  const seen = new Set();
  return String(value || "")
    .split(/\n+/)
    .map((line) => normalize(line))
    .filter(Boolean)
    .filter((line) => line.length <= 180)
    .filter((line) => !/(로그인|회원가입|네이버페이|N\s*pay|공유|신고|인쇄|관심|알림|바로가기)/i.test(line))
    .filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
}

function absoluteUrl(value) {
  try {
    return new URL(value, location.href).href;
  } catch {
    return "";
  }
}

function isElementVisible(node) {
  if (!(node instanceof HTMLElement)) return false;
  const rect = node.getBoundingClientRect();
  const style = window.getComputedStyle(node);
  return (
    rect.width >= 40 &&
    rect.height >= 20 &&
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity || 1) > 0
  );
}

function scorePanel(node) {
  const text = normalize(node.innerText);
  if (text.length < 60 || text.length > 10000) return -100;

  const rect = node.getBoundingClientRect();
  let score = 0;
  DETAIL_KEYWORDS.forEach((keyword) => {
    if (text.includes(keyword)) score += 8;
  });
  if (/월세|전세|매매|보증금/.test(text)) score += 14;
  if (/전용|공급|계약/.test(text)) score += 10;
  if (/주차|엘리베이터|입주/.test(text)) score += 6;
  if (rect.width > 240 && rect.width < 900) score += 6;
  if (rect.height > 140) score += 6;
  if (rect.left > window.innerWidth * 0.82) score -= 16;
  return score;
}

function findCandidatePanels() {
  const selectors = [
    "article",
    "section",
    "aside",
    "main",
    "[class*='detail']",
    "[class*='article']",
    "[class*='complex']",
    "[class*='info']",
    "[class*='panel']",
    "[class*='item']",
  ];

  const candidates = Array.from(document.querySelectorAll(selectors.join(",")))
    .filter(isElementVisible)
    .map((node) => ({
      node,
      score: scorePanel(node),
      text: normalize(node.innerText),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected = [];
  const seen = new Set();
  for (const item of candidates) {
    const key = item.text.slice(0, 160);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(item.node);
    if (selected.length >= 5) break;
  }
  return selected.length ? selected : [document.body].filter(Boolean);
}

function addPairFromText(text, addPair) {
  const lines = normalizeLines(text);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const key = lines[index];
    const value = lines[index + 1];
    if (key.length <= 22 && value.length <= 140 && DETAIL_KEYWORDS.some((keyword) => key.includes(keyword))) {
      addPair(key, value);
    }
  }

  for (const line of lines) {
    const match = line.match(/^([^:：]{2,28})[:：]\s*(.{1,150})$/);
    if (match) addPair(match[1], match[2]);
  }
}

function collectPairsFromPanels(panels) {
  const pairs = [];
  const addPair = (key, value) => {
    const cleanKey = normalize(key).replace(/:$/, "");
    const cleanValue = normalize(value);
    if (!cleanKey || !cleanValue || cleanKey.length > 60 || cleanValue.length > 240) return;
    if (pairs.some((pair) => pair.key === cleanKey && pair.value === cleanValue)) return;
    pairs.push({ key: cleanKey, value: cleanValue });
  };

  for (const panel of panels) {
    panel.querySelectorAll("tr").forEach((row) => {
      const cells = Array.from(row.querySelectorAll("th,td")).map((cell) => normalize(cell.innerText));
      for (let index = 0; index < cells.length - 1; index += 2) {
        addPair(cells[index], cells[index + 1]);
      }
    });

    panel.querySelectorAll("dl").forEach((list) => {
      const terms = Array.from(list.querySelectorAll("dt"));
      const descriptions = Array.from(list.querySelectorAll("dd"));
      terms.forEach((term, index) => addPair(term.innerText, descriptions[index]?.innerText));
    });

    panel.querySelectorAll("li, p, [class*='row'], [class*='item'], [class*='info']").forEach((node) => {
      const text = normalize(node.innerText);
      if (!text || text.length > 220) return;
      const colonMatch = text.match(/^([^:：]{2,28})[:：]\s*(.{1,160})$/);
      if (colonMatch) addPair(colonMatch[1], colonMatch[2]);
    });

    addPairFromText(panel.innerText, addPair);
  }

  return pairs.slice(0, 120);
}

function isBadImage(url, alt, width, height) {
  const haystack = `${url} ${alt}`.toLowerCase();
  if (!/^https?:\/\//i.test(url)) return true;
  if (url.startsWith("data:")) return true;
  if (
    ["sprite", "sp_", "favicon", "logo", "profile", "avatar", "default", "blank", "icon", "marker", "map", "npay", "pay", "banner", "gnb", "talk"].some((token) =>
      haystack.includes(token),
    )
  ) {
    return true;
  }
  if (width && height) {
    const area = width * height;
    const ratio = width / height;
    if (width < 140 || height < 90 || area < 18000) return true;
    if (ratio < 0.45 || ratio > 4.5) return true;
  }
  return false;
}

function collectImagesFromPanels(panels) {
  const imageMap = new Map();
  const addImage = (url, alt = "", source = "extension", width = 0, height = 0) => {
    const cleanUrl = absoluteUrl(url);
    const cleanAlt = normalize(alt);
    const numericWidth = Math.round(Number(width) || 0);
    const numericHeight = Math.round(Number(height) || 0);
    if (isBadImage(cleanUrl, cleanAlt, numericWidth, numericHeight)) return;
    if (!imageMap.has(cleanUrl)) {
      imageMap.set(cleanUrl, {
        url: cleanUrl,
        alt: cleanAlt,
        source,
        width: numericWidth,
        height: numericHeight,
      });
    }
  };

  addImage(document.querySelector("meta[property='og:image']")?.content, "og:image", "meta");

  for (const panel of panels) {
    panel.querySelectorAll("img").forEach((image) => {
      if (!isElementVisible(image)) return;
      addImage(
        image.currentSrc || image.src || image.dataset.src || image.getAttribute("data-src"),
        image.alt,
        "img",
        image.naturalWidth || image.width,
        image.naturalHeight || image.height,
      );
    });

    panel.querySelectorAll("[style*='background']").forEach((node) => {
      if (!isElementVisible(node)) return;
      const rect = node.getBoundingClientRect();
      const style = node.getAttribute("style") || "";
      const matches = style.matchAll(/url\(["']?([^"')]+)["']?\)/g);
      for (const match of matches) {
        addImage(match[1], "", "background", rect.width, rect.height);
      }
    });
  }

  return Array.from(imageMap.values()).slice(0, 16);
}

function hasUsefulDetailText() {
  const text = normalize(document.body?.innerText || "");
  return text.length > 120 && /월세|전세|매매|보증금|전용|공급|주소|주차|엘리베이터/.test(text);
}

function waitForDetailContent(timeoutMs = DETAIL_READY_TIMEOUT_MS) {
  if (hasUsefulDetailText()) return Promise.resolve(true);

  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearInterval(timer);
      resolve(ok);
    };

    const check = () => {
      if (hasUsefulDetailText()) finish(true);
      if (Date.now() - startedAt >= timeoutMs) finish(false);
    };

    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    const timer = window.setInterval(check, 300);
    check();
  });
}

function collectNaverSnapshot() {
  const panels = findCandidatePanels();
  const pairs = collectPairsFromPanels(panels);
  const panelTexts = panels.map((panel) => normalizeLines(panel.innerText).join("\n"));
  const bodyText = normalizeLines(document.body?.innerText || "").slice(0, 220).join("\n");
  const focusedText = normalizeLines(`${panelTexts.join("\n")}\n${bodyText}`).join("\n").slice(0, 10000);
  const metaTitle = document.querySelector("meta[property='og:title']")?.content || "";
  const title = normalize(document.querySelector("h1")?.innerText) || normalize(metaTitle) || normalize(document.title);
  const images = collectImagesFromPanels(panels);

  const snapshot = {
    listing_url: location.href,
    title,
    page_title: normalize(document.title),
    pairs,
    images,
    visible_text: focusedText,
    focused_text: focusedText,
    panel_texts: panelTexts.slice(0, 5),
  };

  return window.AgentNoteNaverExtractor?.enrichSnapshot
    ? window.AgentNoteNaverExtractor.enrichSnapshot(snapshot)
    : snapshot;
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
    maxWidth: "380px",
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

  window.setTimeout(() => status?.remove(), 6000);
}

async function handleImportClick(button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "읽는 중...";

  try {
    const ready = await waitForDetailContent();
    const snapshot = collectNaverSnapshot();
    const missingCount = snapshot.missingFields?.length || 0;

    if (!ready && (!snapshot.visible_text || snapshot.visible_text.length < 80)) {
      throw new Error("매물 정보를 가져오지 못했습니다. 페이지가 완전히 로딩된 후 다시 시도해 주세요.");
    }

    const response = await chrome.runtime.sendMessage({
      type: "IMPORT_NAVER_SNAPSHOT",
      snapshot,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "업무툴로 보내지 못했습니다.");
    }

    if (missingCount > 0) {
      showStatus(`일부 정보만 가져왔습니다. 가격, 면적 등 누락된 항목 ${missingCount}개를 확인해 주세요.`);
    } else {
      showStatus("네이버 부동산 매물 정보를 가져왔습니다. 누락된 항목을 확인해 주세요.");
    }
  } catch (err) {
    console.error("[AgentNote Import]", err);
    showStatus(err?.message || "매물 정보를 가져오지 못했습니다. 페이지가 완전히 로딩된 후 다시 시도해 주세요.", true);
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
  button.title = "현재 네이버 부동산 화면의 매물 정보를 AgentNote 소개서 작성 화면으로 보냅니다.";

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

function installUrlWatcher() {
  let lastUrl = location.href;
  const checkUrl = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    showStatus("페이지 이동을 감지했습니다. 매물 상세가 로딩되면 다시 가져올 수 있습니다.");
    injectImportButton();
  };

  const wrapHistory = (methodName) => {
    const original = history[methodName];
    history[methodName] = function wrappedHistoryMethod() {
      const result = original.apply(this, arguments);
      window.setTimeout(checkUrl, 50);
      return result;
    };
  };

  wrapHistory("pushState");
  wrapHistory("replaceState");
  window.addEventListener("popstate", checkUrl);
  window.setInterval(checkUrl, 1000);
}

injectImportButton();
installUrlWatcher();

const observer = new MutationObserver(() => injectImportButton());
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});
