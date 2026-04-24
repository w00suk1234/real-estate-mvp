const BUTTON_ID = "real-estate-mvp-import-button";
const STATUS_ID = "real-estate-mvp-import-status";

const JUNK_LINE_PATTERNS = [
  /바로가기/,
  /네이버\s*페이/,
  /N\s*pay/i,
  /로그인/,
  /알림/,
  /메일/,
  /전체서비스/,
  /지도/,
  /필터/,
  /검색/,
  /포인트/,
  /금융/,
  /증권/,
  /뉴스/,
  /커뮤니티/,
  /새로운\s*부동산/,
];

const DETAIL_KEYWORDS = [
  "매매",
  "전세",
  "월세",
  "보증금/월세",
  "보증금",
  "관리비",
  "주소",
  "소재지",
  "면적",
  "공급",
  "전용",
  "계약면적",
  "층",
  "층수",
  "방향",
  "입주",
  "주차",
  "매물번호",
  "단지 정보",
  "사진",
  "사무실",
  "중소형사무실",
  "전용률",
  "엘리베이터",
  "화장실",
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
    .filter((line) => line.length <= 140)
    .filter((line) => !JUNK_LINE_PATTERNS.some((pattern) => pattern.test(line)))
    .filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
}

function collectRelevantBodyText() {
  const seen = new Set();
  return String(document.body?.innerText || "")
    .split(/\n+/)
    .map((line) => normalize(line))
    .filter(Boolean)
    .filter((line) => line.length <= 140)
    .filter((line) => !JUNK_LINE_PATTERNS.some((pattern) => pattern.test(line)))
    .filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    })
    .filter(
      (line) =>
        DETAIL_KEYWORDS.some((keyword) => line.includes(keyword)) ||
        /(?:월세|전세|매매)\s*[\d,.]+/.test(line) ||
        /[\d,.]+\s*(?:㎡|m²|m2|평)\s*\/\s*[\d,.]+\s*(?:㎡|m²|m2|평)/.test(line) ||
        /(?:서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)/.test(line) ||
        /\d+\s*\/\s*\d+\s*층/.test(line)
    )
    .slice(0, 140)
    .join("\n");
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
    rect.width >= 80 &&
    rect.height >= 30 &&
    rect.bottom > 80 &&
    rect.top < window.innerHeight &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity || 1) > 0
  );
}

function scorePanel(node) {
  const text = normalize(node.innerText);
  if (text.length < 80 || text.length > 7000) return -100;

  const rect = node.getBoundingClientRect();
  let score = 0;

  for (const keyword of DETAIL_KEYWORDS) {
    if (text.includes(keyword)) score += 8;
  }

  for (const pattern of JUNK_LINE_PATTERNS) {
    if (pattern.test(text)) score -= 6;
  }

  if (rect.left < window.innerWidth * 0.68) score += 18;
  if (rect.left > window.innerWidth * 0.75) score -= 30;
  if (rect.top < 100) score -= 12;
  if (rect.width > 260 && rect.width < 780) score += 8;
  if (rect.height > 160) score += 8;

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
    "[class*='list']",
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
    const key = item.text.slice(0, 180);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(item.node);
    if (selected.length >= 4) break;
  }

  return selected;
}

function addPairFromText(text, addPair) {
  const lines = normalizeLines(text);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const key = lines[index];
    const value = lines[index + 1];
    if (
      key.length <= 18 &&
      value.length <= 100 &&
      DETAIL_KEYWORDS.some((keyword) => key.includes(keyword))
    ) {
      addPair(key, value);
    }
  }

  for (const line of lines) {
    const directPatterns = [
      [/^(보증금\/월세)\s+(.+)$/, 1, 2],
      [/^(관리비)\s+(.+)$/, 1, 2],
      [/^(주소|소재지|위치)\s+(.+)$/, 1, 2],
      [/^(전용면적|공급면적|계약면적)\s+(.+)$/, 1, 2],
      [/^(층수|해당층)\s+(.+)$/, 1, 2],
      [/^(엘리베이터)\s+(.+)$/, 1, 2],
      [/^(주차(?:가능여부)?)\s+(.+)$/, 1, 2],
    ];

    for (const [pattern, keyIndex, valueIndex] of directPatterns) {
      const match = line.match(pattern);
      if (match) addPair(match[keyIndex], match[valueIndex]);
    }
  }
}

function collectPairsFromPanels(panels) {
  const pairs = [];
  const addPair = (key, value) => {
    const cleanKey = normalize(key).replace(/:$/, "");
    const cleanValue = normalize(value);
    if (!cleanKey || !cleanValue || cleanKey.length > 50 || cleanValue.length > 220) return;
    if (JUNK_LINE_PATTERNS.some((pattern) => pattern.test(cleanKey))) return;
    if (pairs.some((pair) => pair.key === cleanKey && pair.value === cleanValue)) return;
    pairs.push({ key: cleanKey, value: cleanValue });
  };

  for (const panel of panels) {
    panel.querySelectorAll("tr").forEach((row) => {
      const cells = Array.from(row.querySelectorAll("th,td")).map((cell) =>
        normalize(cell.innerText)
      );
      for (let index = 0; index < cells.length - 1; index += 2) {
        addPair(cells[index], cells[index + 1]);
      }
    });

    panel.querySelectorAll("dl").forEach((list) => {
      const terms = Array.from(list.querySelectorAll("dt"));
      const descriptions = Array.from(list.querySelectorAll("dd"));
      terms.forEach((term, index) => {
        addPair(term.innerText, descriptions[index]?.innerText);
      });
    });

    panel
      .querySelectorAll("[class*='info'], [class*='detail'], [class*='article'], li, p, div")
      .forEach((node) => {
        const text = normalize(node.innerText);
        if (!text || text.length > 180) return;
        const colonMatch = text.match(/^([^:：]{2,24})[:：]\s*(.{1,140})$/);
        if (colonMatch) addPair(colonMatch[1], colonMatch[2]);
      });

    addPairFromText(panel.innerText, addPair);
  }

  return pairs.slice(0, 80);
}

function isBadImage(url, alt, width, height) {
  const haystack = `${url} ${alt}`.toLowerCase();
  if (!/^https?:\/\//i.test(url)) return true;
  if (url.startsWith("data:")) return true;
  if (
    [
      "sprite",
      "sp_",
      "favicon",
      "logo",
      "profile",
      "avatar",
      "default",
      "blank",
      "icon",
      "marker",
      "map",
      "npay",
      "pay",
      "banner",
      "gnb",
      "talk",
    ].some((token) => haystack.includes(token))
  ) {
    return true;
  }

  if (width && height) {
    const area = width * height;
    const ratio = width / height;
    if (width < 160 || height < 100 || area < 24000) return true;
    if (ratio < 0.45 || ratio > 4.2) return true;
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

  for (const panel of panels) {
    panel.querySelectorAll("img").forEach((image) => {
      if (!isElementVisible(image)) return;
      addImage(
        image.currentSrc || image.src || image.dataset.src || image.getAttribute("data-src"),
        image.alt,
        "img",
        image.naturalWidth || image.width,
        image.naturalHeight || image.height
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

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalize(match[1]);
  }
  return "";
}

function findPairValue(pairs, aliases) {
  const match = pairs.find((pair) => aliases.some((alias) => pair.key.includes(alias)));
  return match?.value || "";
}

function normalizeAddress(value) {
  const text = normalize(value);
  if (!text) return "";
  const parts = text
    .replace(/(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)/g, "\n$1")
    .split("\n")
    .map((part) => normalize(part))
    .filter((part) => part.length >= 8 && part.length <= 80);
  if (parts.length === 0) return text.slice(0, 80);
  return parts.find((part) => /로|길/.test(part)) || parts[0];
}

function extractMoneyToManwon(value) {
  const text = normalize(value).replaceAll(",", "");
  const eokMatch = text.match(/([\d.]+)\s*억/);
  if (eokMatch) {
    const eok = Number(eokMatch[1]) || 0;
    const afterEok = text.slice(eokMatch.index + eokMatch[0].length);
    const restMatch = afterEok.match(/([\d.]+)/);
    return String(Math.round(eok * 10000 + (Number(restMatch?.[1]) || 0)));
  }
  const number = text.match(/[\d.]+/);
  return number?.[0] || "";
}

function extractStructuredFields(focusedText, pairs, title) {
  const text = normalize(focusedText);
  const lines = normalizeLines(focusedText);

  const priceText =
    findPairValue(pairs, ["가격", "매매가", "전세가", "보증금", "월세"]) ||
    firstMatch(text, [
      /(월세\s*[\d,.]+(?:억)?(?:\s*[\d,.]+)?\s*\/\s*[\d,.]+)/,
      /(매매\s*[\d,.]+(?:억)?(?:\s*[\d,.]+)?)/,
      /(전세\s*[\d,.]+(?:억)?(?:\s*[\d,.]+)?)/,
      /(해당면적\s*최고가\s*[\d,.]+(?:억)?(?:\s*[\d,.]+)?)/,
    ]);

  const dealType = priceText.includes("매매")
    ? "매매"
    : priceText.includes("전세")
      ? "전세"
      : "월세";

  const areaText =
    findPairValue(pairs, ["계약면적", "공급면적", "전용면적"]) ||
    firstMatch(text, [
      /((?:공급|계약|전용)\s*[\d,.]+\s*(?:㎡|m²|m2|평)[^ ]{0,30})/,
      /((?:[\d,.]+\s*(?:㎡|m²|m2|평)\s*\/\s*)?전용\s*[\d,.]+\s*(?:㎡|m²|m2|평))/,
    ]);

  const supplyArea =
    firstMatch(areaText, [/(?:공급|계약)\s*([\d,.]+)/]) ||
    firstMatch(text, [/(?:공급|계약)면적\s*([\d,.]+)/]);
  const exclusiveArea =
    firstMatch(areaText, [/전용\s*([\d,.]+)/]) ||
    firstMatch(text, [/전용(?:면적)?\s*([\d,.]+)/]);

  const address = normalizeAddress(
    findPairValue(pairs, ["주소", "소재지", "위치"]) ||
      firstMatch(text, [
        /((?:서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]{8,90})/,
      ])
  );

  const floor =
    findPairValue(pairs, ["층수", "해당층", "층"]) ||
    firstMatch(text, [/(\d+\s*층\s*\/\s*\d+\s*층|\d+\s*\/\s*\d+\s*층|지하\s*\d+\s*층|반지하)/]);

  const parking =
    findPairValue(pairs, ["주차", "주차가능여부"]) ||
    firstMatch(text, [/(주차\s*(?:가능|불가|협의|무료|유료|[\d,]+대))/]);

  const elevator =
    findPairValue(pairs, ["엘리베이터"]) ||
    firstMatch(text, [/엘리베이터\s*(유|무|있음|없음)/]);

  const titleCandidate =
    lines.find((line) => {
      if (line.length < 4 || line.length > 42) return false;
      if (/매매|전세|월세|가격|주소|면적|층수|관리비|허위매물/.test(line)) return false;
      return /[가-힣]/.test(line) && /동|단지|상가|오피스텔|아파트|빌딩|사무실|중소형사무실/.test(line);
    }) ||
    normalize(title).replace(/네이버.*$/, "").slice(0, 42);

  const deposit = dealType === "월세" ? extractMoneyToManwon(priceText.split("/")[0]) : extractMoneyToManwon(priceText);
  const monthlyRent = dealType === "월세" ? extractMoneyToManwon(priceText.split("/")[1] || "") : "";

  return {
    title: titleCandidate,
    deal_type: dealType,
    price_text: priceText,
    deposit,
    monthly_rent: monthlyRent,
    address,
    area_text: areaText,
    supply_area: supplyArea,
    exclusive_area: exclusiveArea,
    floor,
    parking,
    elevator,
  };
}

function collectNaverSnapshot() {
  const panels = findCandidatePanels();
  const fallbackPanel = panels.length > 0 ? panels : [document.body].filter(Boolean);
  const pairs = collectPairsFromPanels(fallbackPanel);
  const panelTexts = fallbackPanel.map((panel) => normalizeLines(panel.innerText).join("\n"));
  const bodyHints = collectRelevantBodyText();
  const focusedText = normalizeLines(`${panelTexts.join("\n")}\n${bodyHints}`).join("\n").slice(0, 9000);

  const metaTitle = document.querySelector("meta[property='og:title']")?.content || "";
  const title =
    normalize(document.querySelector("h1")?.innerText) ||
    normalize(metaTitle) ||
    normalize(document.title);

  const images = collectImagesFromPanels(fallbackPanel);
  const parsedFields = extractStructuredFields(focusedText, pairs, title);

  return {
    listing_url: location.href,
    title,
    page_title: normalize(document.title),
    pairs,
    images,
    visible_text: focusedText,
    focused_text: focusedText,
    panel_texts: panelTexts.slice(0, 4),
    parsed_fields: parsedFields,
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
    maxWidth: "360px",
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
  }, 5000);
}

async function handleImportClick(button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "읽는 중...";

  try {
    const snapshot = collectNaverSnapshot();
    if (!snapshot.visible_text || snapshot.visible_text.length < 80) {
      throw new Error("현재 네이버 화면에서 읽을 내용이 너무 적습니다. 매물 상세 패널을 먼저 열어주세요.");
    }

    const response = await chrome.runtime.sendMessage({
      type: "IMPORT_NAVER_SNAPSHOT",
      snapshot,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "업무툴로 보내지 못했습니다.");
    }

    const filled = Object.values(snapshot.parsed_fields || {}).filter(Boolean).length;
    showStatus(
      `업무툴로 보냈습니다. 핵심값 ${filled}개, 표 후보 ${snapshot.pairs.length}개, 사진 후보 ${snapshot.images.length}개를 전달했습니다.`
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
  button.title = "현재 네이버 매물 화면을 부동산 업무툴 소개서 작성으로 보냅니다.";

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
