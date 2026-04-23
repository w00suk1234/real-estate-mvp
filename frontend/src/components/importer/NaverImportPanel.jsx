import { useEffect, useMemo, useRef, useState } from "react";
import { importNaverListing } from "../../api";
import { useAuth } from "../../auth/AuthContext";

const NAVER_LAND_URL = "https://new.land.naver.com/";

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractNaverLandUrl(value) {
  const trimmed = normalize(value);
  const match = trimmed.match(/https?:\/\/(?:new\.)?land\.naver\.com[^\s"'<>)]*/i);
  return match?.[0] || trimmed;
}

function firstRegex(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalize(match[1]);
  }
  return "";
}

function findByAliases(table, aliases) {
  for (const [key, value] of Object.entries(table)) {
    if (aliases.some((alias) => key.includes(alias))) return normalize(value);
  }
  return "";
}

function makePairTable(snapshot) {
  const table = {};
  for (const pair of snapshot?.pairs || []) {
    const key = normalize(pair.key);
    const value = normalize(pair.value);
    if (key && value && !table[key]) table[key] = value;
  }
  return table;
}

function cleanNumber(value) {
  const match = String(value || "").match(/[\d,.]+/);
  return match ? match[0].replaceAll(",", "") : "";
}

function moneyToManwon(value) {
  const text = normalize(value).replaceAll(",", "");
  const eokMatch = text.match(/([\d.]+)\s*억/);
  if (eokMatch) {
    const eok = Number(eokMatch[1]) || 0;
    const afterEok = text.slice(eokMatch.index + eokMatch[0].length);
    const restMatch = afterEok.match(/([\d.]+)/);
    return String(Math.round(eok * 10000 + (Number(restMatch?.[1]) || 0)));
  }
  return cleanNumber(text);
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

function isBadImageCandidate(image) {
  const url = String(image?.url || "").toLowerCase();
  const alt = String(image?.alt || "").toLowerCase();
  const haystack = `${url} ${alt}`;
  const width = Number(image?.width) || 0;
  const height = Number(image?.height) || 0;

  if (!url || !url.startsWith("http")) return true;
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

function extractPrice(text, table, parsed) {
  return (
    normalize(parsed?.price_text) ||
    findByAliases(table, ["가격", "매매가", "전세가", "보증금", "월세"]) ||
    firstRegex(text, [
      /(월세\s*[\d,.]+(?:억)?(?:\s*[\d,.]+)?\s*\/\s*[\d,.]+)/,
      /(매매\s*[\d,.]+(?:억)?(?:\s*[\d,.]+)?)/,
      /(전세\s*[\d,.]+(?:억)?(?:\s*[\d,.]+)?)/,
      /(해당면적\s*최고가\s*[\d,.]+(?:억)?(?:\s*[\d,.]+)?)/,
    ])
  );
}

function extractArea(text, table, parsed) {
  const areaText =
    normalize(parsed?.area_text) ||
    findByAliases(table, ["계약면적", "공급면적", "전용면적"]) ||
    firstRegex(text, [
      /((?:공급|계약|전용)\s*[\d,.]+\s*(?:㎡|m²|m2|평)[^ ]{0,30})/,
      /((?:[\d,.]+\s*(?:㎡|m²|m2|평)\s*\/\s*)?전용\s*[\d,.]+\s*(?:㎡|m²|m2|평))/,
    ]);

  return {
    areaText,
    supplyArea:
      cleanNumber(parsed?.supply_area) ||
      firstRegex(areaText, [/(?:공급|계약)\s*([\d,.]+)/]) ||
      firstRegex(text, [/(?:공급|계약)면적\s*([\d,.]+)/]),
    exclusiveArea:
      cleanNumber(parsed?.exclusive_area) ||
      firstRegex(areaText, [/전용\s*([\d,.]+)/]) ||
      firstRegex(text, [/전용(?:면적)?\s*([\d,.]+)/]),
  };
}

function buildLocalDraftFromSnapshot(snapshot) {
  const parsed = snapshot?.parsed_fields || {};
  const table = makePairTable(snapshot);
  const text = normalize(snapshot?.focused_text || snapshot?.visible_text);

  const title =
    normalize(parsed.title) ||
    firstRegex(text, [
      /([가-힣A-Za-z0-9.\s-]{2,42}(?:아파트|오피스텔|빌라|상가|사무실|빌딩|단지|동)\s*\d{0,4})/,
    ]) ||
    "네이버 매물 초안";

  const priceText = extractPrice(text, table, parsed);
  const dealType =
    normalize(parsed.deal_type) ||
    (priceText.includes("매매") ? "매매" : priceText.includes("전세") ? "전세" : "월세");

  const deposit =
    normalize(parsed.deposit) ||
    (dealType === "월세"
      ? moneyToManwon(priceText.split("/")[0])
      : moneyToManwon(priceText));
  const monthlyRent =
    normalize(parsed.monthly_rent) ||
    (dealType === "월세" ? moneyToManwon(priceText.split("/")[1] || "") : "");

  const address = normalizeAddress(
    normalize(parsed.address) ||
      findByAliases(table, ["주소", "소재지", "위치"]) ||
      firstRegex(text, [
        /((?:서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]{8,90})/,
      ])
  );

  const { areaText, supplyArea, exclusiveArea } = extractArea(text, table, parsed);
  const floor =
    normalize(parsed.floor) ||
    findByAliases(table, ["층수", "해당층", "층"]) ||
    firstRegex(text, [/(\d+\s*층\s*\/\s*\d+\s*층|\d+\s*\/\s*\d+\s*층|지하\s*\d+\s*층|반지하)/]);
  const parking =
    normalize(parsed.parking) ||
    findByAliases(table, ["주차", "주차가능여부"]) ||
    firstRegex(text, [/(주차\s*(?:가능|불가|협의|무료|유료|[\d,]+대))/]);
  const elevator = normalize(parsed.elevator) || findByAliases(table, ["엘리베이터"]);

  const images = (snapshot?.images || [])
    .filter((image) => !isBadImageCandidate(image))
    .slice(0, 10)
    .map((image, index) => ({
      ...image,
      alt: "",
      category: index === 0 ? "대표 후보" : "매물 사진 후보",
      confidence: image.confidence || 0.6,
    }));

  const description = [
    "네이버 화면에서 읽은 값으로 만든 소개서 초안입니다.",
    priceText ? `가격: ${priceText}` : "",
    address ? `주소: ${address}` : "",
    areaText ? `면적: ${areaText}` : "",
    floor ? `층수: ${floor}` : "",
    parking ? `주차: ${parking}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const fieldMapping = {
    title,
    deal_type: dealType,
    address,
    supply_area: cleanNumber(supplyArea),
    exclusive_area: cleanNumber(exclusiveArea),
    floor,
    deposit,
    monthly_rent: monthlyRent,
    elevator: /무|없음/.test(elevator) ? "무" : elevator ? "유" : "",
    parking_count: cleanNumber(parking),
    description,
  };

  const warnings = [];
  if (!priceText) warnings.push("가격을 못 읽었습니다. 실제 매물 상세가 열린 상태인지 확인해주세요.");
  if (!address) warnings.push("주소를 못 읽었습니다. 상세 정보 패널에 주소가 보이게 한 뒤 다시 가져와보세요.");
  if (!areaText && !supplyArea && !exclusiveArea) warnings.push("면적을 못 읽었습니다. 단지정보가 아니라 매물 상세 정보가 보여야 합니다.");
  if (images.length === 0) warnings.push("사진을 못 찾았습니다. 네이버의 사진 탭을 연 상태에서 다시 가져오면 성공률이 올라갑니다.");

  return {
    brochure_title: title,
    summary_points: [address, priceText, areaText, floor].filter(Boolean),
    description,
    field_mapping: Object.fromEntries(
      Object.entries(fieldMapping).filter(([, value]) => normalize(value))
    ),
    recommended_images: images,
    warnings,
    source: "extension-local",
  };
}

function makeCoverage(draft) {
  const fields = draft?.field_mapping || {};
  const images = draft?.recommended_images || [];
  return [
    { key: "title", label: "매물명", ok: Boolean(fields.title), value: fields.title },
    { key: "price", label: "가격", ok: Boolean(fields.deposit || fields.monthly_rent), value: fields.monthly_rent ? `${fields.deposit}/${fields.monthly_rent}` : fields.deposit },
    { key: "address", label: "주소", ok: Boolean(fields.address), value: fields.address },
    { key: "area", label: "면적", ok: Boolean(fields.supply_area || fields.exclusive_area), value: fields.exclusive_area || fields.supply_area },
    { key: "floor", label: "층수", ok: Boolean(fields.floor), value: fields.floor },
    { key: "images", label: "사진", ok: images.length > 0, value: images.length ? `${images.length}장` : "" },
  ];
}

function NaverImportPanel({ initialUrl = "", initialSnapshot = null, onApplyDraft }) {
  const [listingUrl, setListingUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [localDraft, setLocalDraft] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [handledSnapshotKey, setHandledSnapshotKey] = useState("");
  const { isAuthenticated } = useAuth();
  const helpRef = useRef(null);

  const activeDraft = result?.brochure_draft || localDraft;
  const images = activeDraft?.recommended_images || [];
  const coverage = useMemo(() => makeCoverage(activeDraft), [activeDraft]);

  const snapshotStats = useMemo(() => {
    if (!initialSnapshot?.listing_url) return null;
    return {
      pairs: initialSnapshot.pairs?.length || 0,
      images: initialSnapshot.images?.length || 0,
      textLength: (initialSnapshot.focused_text || initialSnapshot.visible_text || "").length,
      parsed: Object.values(initialSnapshot.parsed_fields || {}).filter(Boolean).length,
    };
  }, [initialSnapshot]);

  useEffect(() => {
    if (!initialUrl) return;
    setListingUrl(extractNaverLandUrl(initialUrl));
    setError("");
  }, [initialUrl]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!helpRef.current?.contains(event.target)) {
        setHelpOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!initialSnapshot?.listing_url) return;

    const snapshotKey = [
      initialSnapshot.listing_url,
      initialSnapshot.received_at || "",
      initialSnapshot.focused_text?.length || initialSnapshot.visible_text?.length || 0,
      initialSnapshot.images?.length || 0,
      initialSnapshot.pairs?.length || 0,
    ].join(":");

    if (handledSnapshotKey === snapshotKey) return;

    const fallbackDraft = buildLocalDraftFromSnapshot(initialSnapshot);
    setHandledSnapshotKey(snapshotKey);
    setListingUrl(extractNaverLandUrl(initialSnapshot.listing_url));
    setLocalDraft(fallbackDraft);
    setResult(null);
    setError("");
    setStatus("현재 네이버 화면에서 읽은 값을 정제해서 반영했습니다. 서버가 다시 긁어오는 방식은 자동으로 덮어쓰지 않습니다.");
    onApplyDraft?.(fallbackDraft);
  }, [initialSnapshot, handledSnapshotKey, onApplyDraft]);

  const openNaverLand = () => {
    window.open(NAVER_LAND_URL, "_blank", "noopener,noreferrer");
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setListingUrl(extractNaverLandUrl(text));
      setError("");
    } catch {
      setError("브라우저가 클립보드 읽기를 막았습니다. 복사한 URL을 직접 붙여넣어 주세요.");
    }
  };

  const handleUrlImport = async () => {
    if (!isAuthenticated) {
      setError("URL 가져오기는 로그인 후 사용할 수 있습니다.");
      return;
    }

    const normalizedUrl = extractNaverLandUrl(listingUrl);
    if (!normalizedUrl) {
      setError("네이버 부동산 매물 URL을 입력해주세요.");
      return;
    }

    if (!normalizedUrl.includes("land.naver.com")) {
      setError("현재는 네이버 부동산 URL만 가져올 수 있습니다.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setListingUrl(normalizedUrl);
      const data = await importNaverListing(normalizedUrl);
      setResult(data);
      setLocalDraft(null);
      if (data?.brochure_draft) onApplyDraft?.(data.brochure_draft);
    } catch (err) {
      console.error(err);
      setError(
        `${err.message || "URL 가져오기 중 오류가 발생했습니다."} 이 방식은 서버가 네이버를 다시 여는 예비 기능이라 실패할 수 있습니다. 네이버 화면의 '업무툴로 가져오기' 버튼을 추천합니다.`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel import-panel">
      <div className="panel-head import-panel-head">
        <div>
          <h3>네이버 매물 → 소개서 초안</h3>
          <p>현재 보고 있는 네이버 상세 패널만 읽어와 폼에 넣는 반자동 흐름입니다.</p>
        </div>
        <div className="import-head-actions" ref={helpRef}>
          <button
            type="button"
            className="import-help-trigger"
            onClick={() => setHelpOpen((prev) => !prev)}
            aria-label="네이버 매물 가져오기 도움말"
            aria-expanded={helpOpen}
          >
            !
          </button>

          {helpOpen && (
            <div className="import-help-popover">
              <strong>처음 쓰는 분 가이드</strong>
              <ol className="import-help-list">
                <li>네이버에서 실제 매물 하나를 클릭합니다.</li>
                <li>상세 정보나 사진 탭이 보이게 둡니다.</li>
                <li>오른쪽 아래 업무툴로 가져오기 버튼을 누릅니다.</li>
                <li>우리 앱에서 채워진 값만 검토하고 저장합니다.</li>
              </ol>
              <p>
                가격이나 면적이 비어 있으면 네이버 쪽 상세 패널이 충분히 펼쳐져 있는지 먼저 확인해
                주세요.
              </p>
            </div>
          )}
        </div>
      </div>

      {snapshotStats && (
        <div className="import-debug-box">
          <strong>정제 수집 결과</strong>
          <span>핵심값 {snapshotStats.parsed}개</span>
          <span>표 후보 {snapshotStats.pairs}개</span>
          <span>사진 후보 {snapshotStats.images}개</span>
          <span>패널 텍스트 {snapshotStats.textLength.toLocaleString()}자</span>
        </div>
      )}

      {activeDraft && (
        <div className="import-coverage-grid">
          {coverage.map((item) => (
            <div
              key={item.key}
              className={`coverage-item ${item.ok ? "ok" : "missing"}`}
              title={item.value || "비어 있음"}
            >
              <span>{item.label}</span>
              <strong>{item.ok ? "읽음" : "비어 있음"}</strong>
            </div>
          ))}
        </div>
      )}

      {status && <div className="import-alert success">{status}</div>}

      <details className="url-fallback-box">
        <summary>URL로 가져오기 예비 기능</summary>
        <p>
          URL 방식은 서버가 네이버를 다시 열어야 해서 timeout이 날 수 있습니다. 실제 서비스 흐름은
          네이버 화면의 업무툴 버튼입니다.
        </p>
        <div className="import-quick-actions">
          <button type="button" className="secondary-btn" onClick={openNaverLand}>
            네이버 부동산 열기
          </button>
          <button type="button" className="secondary-btn" onClick={pasteFromClipboard}>
            복사한 URL 붙여넣기
          </button>
        </div>
        <div className="import-row">
          <input
            className="import-url-input"
            value={listingUrl}
            onChange={(e) => setListingUrl(e.target.value)}
            placeholder="https://new.land.naver.com/..."
          />
          <button
            type="button"
            className="cta-btn import-btn"
            onClick={handleUrlImport}
            disabled={loading}
          >
            {loading ? "분석 중..." : "URL로 가져오기"}
          </button>
        </div>
      </details>

      {error && <div className="import-alert danger">{error}</div>}

      {activeDraft && (
        <div className="import-result">
          <div className="import-result-top">
            <div>
              <strong>{activeDraft.brochure_title}</strong>
              <p>{activeDraft.summary_points?.join(" · ") || "읽은 값을 바탕으로 초안을 만들었습니다."}</p>
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => onApplyDraft?.(activeDraft)}
            >
              다시 반영
            </button>
          </div>

          {activeDraft.warnings?.length > 0 && (
            <div className="import-alert">
              {activeDraft.warnings.slice(0, 4).map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}

          {images.length > 0 && (
            <div className="import-image-strip">
              {images.slice(0, 8).map((image, index) => (
                <a
                  key={`${image.url}-${index}`}
                  href={image.url}
                  target="_blank"
                  rel="noreferrer"
                  className="import-image-item"
                >
                  <span>{image.category || `이미지 ${index + 1}`}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default NaverImportPanel;
