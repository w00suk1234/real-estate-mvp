import { useEffect, useMemo, useState } from "react";
import { importNaverListing, importNaverSnapshot } from "../../api";
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

function makePairTable(snapshot) {
  const table = {};
  for (const pair of snapshot?.pairs || []) {
    const key = normalize(pair.key);
    const value = normalize(pair.value);
    if (key && value && !table[key]) table[key] = value;
  }
  return table;
}

function findByAliases(table, aliases) {
  for (const [key, value] of Object.entries(table)) {
    if (aliases.some((alias) => key.includes(alias))) return value;
  }
  return "";
}

function firstRegex(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalize(match[1]);
  }
  return "";
}

function cleanNumber(value) {
  const match = String(value || "").match(/[\d,.]+/);
  return match ? match[0].replaceAll(",", "") : "";
}

function splitArea(areaText) {
  const numbers = String(areaText || "").match(/[\d,.]+/g) || [];
  return {
    supplyArea: numbers[0]?.replaceAll(",", "") || "",
    exclusiveArea: numbers[1]?.replaceAll(",", "") || numbers[0]?.replaceAll(",", "") || "",
  };
}

function inferTitle(snapshot, text) {
  const rawTitle = normalize(snapshot?.title || snapshot?.page_title);
  const badTitle = !rawTitle || rawTitle.includes("네이버") || rawTitle.includes("부동산");
  if (!badTitle && rawTitle.length <= 80) return rawTitle;

  return firstRegex(text, [
    /([가-힣A-Za-z0-9.\s-]{2,40}(?:아파트|오피스텔|빌라|상가|사무실|빌딩|단지|동)\s*\d{0,4})/,
    /([가-힣A-Za-z0-9.\s-]{2,40}\s+(?:매매|전세|월세)\s*[\d,.]+[^\s]{0,10})/,
  ]);
}

function inferDealType(priceText, text) {
  if (priceText.includes("매매") || text.includes("매매")) return "매매";
  if (priceText.includes("전세") || text.includes("전세")) return "전세";
  return "월세";
}

function buildLocalDraftFromSnapshot(snapshot) {
  const table = makePairTable(snapshot);
  const text = normalize(snapshot?.visible_text);
  const title = inferTitle(snapshot, text) || "네이버 매물 초안";

  const address =
    findByAliases(table, ["주소", "소재지", "위치"]) ||
    firstRegex(text, [
      /(서울[^\n]{4,70})/,
      /(경기[^\n]{4,70})/,
      /(인천[^\n]{4,70})/,
      /주소\s*([^\n]{4,80})/,
    ]);

  const areaText =
    findByAliases(table, ["계약면적", "공급면적", "전용면적", "면적"]) ||
    firstRegex(text, [
      /면적\s*([^\n]{2,80})/,
      /([\d,.]+\s*(?:㎡|m²|m2|평)(?:\s*[/,]\s*[\d,.]+\s*(?:㎡|m²|m2|평))?)/,
    ]);

  const { supplyArea, exclusiveArea } = splitArea(areaText);

  const floor =
    findByAliases(table, ["층수", "해당층", "층"]) ||
    firstRegex(text, [
      /(\d+\s*\/\s*\d+\s*층)/,
      /(\d+\s*층\s*\/\s*\d+\s*층)/,
      /(지하\s*\d+\s*층|반지하|\d+\s*층)/,
    ]);

  const priceText =
    findByAliases(table, ["가격", "보증금", "매매가", "전세가", "월세"]) ||
    firstRegex(text, [
      /(월세\s*[\d,.]+\s*\/\s*[\d,.]+)/,
      /(매매\s*[\d,.]+[^\s]{0,10})/,
      /(전세\s*[\d,.]+[^\s]{0,10})/,
    ]);

  const dealType = inferDealType(priceText, text);
  const priceNumbers = priceText.match(/[\d,.]+/g) || [];
  const deposit =
    dealType === "매매" || dealType === "전세"
      ? cleanNumber(priceText)
      : priceNumbers[0]?.replaceAll(",", "") || "";
  const monthlyRent = dealType === "월세" ? priceNumbers[1]?.replaceAll(",", "") || "" : "";

  const rooms =
    findByAliases(table, ["방수", "방"]) || firstRegex(text, [/방\s*([0-9]+개?)/]);
  const parking =
    findByAliases(table, ["주차", "주차가능여부"]) ||
    firstRegex(text, [/(주차\s*(?:가능|불가|협의|[0-9]+대))/]);

  const description = [
    "네이버 화면에서 가져온 정보를 바탕으로 만든 소개서 초안입니다.",
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
    supply_area: supplyArea,
    exclusive_area: exclusiveArea,
    floor,
    deposit,
    monthly_rent: monthlyRent,
    rooms: cleanNumber(rooms),
    parking_count: cleanNumber(parking),
    description,
  };

  const recommendedImages = (snapshot?.images || [])
    .filter((image) => image.url)
    .filter((image) => {
      const url = image.url.toLowerCase();
      return !url.includes("sprite") && !url.includes("sp_") && !url.includes("favicon");
    })
    .slice(0, 10)
    .map((image, index) => ({
      ...image,
      category: index === 0 ? "대표 후보" : "네이버 이미지",
      confidence: image.confidence || 0.5,
    }));

  const warnings = [];
  if (!address) warnings.push("주소를 못 읽었습니다. 네이버 상세 패널에 주소가 보이게 한 뒤 다시 가져와보세요.");
  if (!priceText) warnings.push("가격을 못 읽었습니다. 매물 리스트에서 실제 매물을 클릭한 상태인지 확인해주세요.");
  if (!areaText) warnings.push("면적을 못 읽었습니다. 단지정보가 아니라 매물 상세 정보 패널이 열려 있어야 합니다.");
  if (recommendedImages.length === 0) warnings.push("사진 URL을 못 찾았습니다. 사진 탭을 연 뒤 다시 가져오면 성공률이 올라갑니다.");

  return {
    brochure_title: title,
    summary_points: [address, priceText, areaText, floor].filter(Boolean),
    description,
    field_mapping: Object.fromEntries(
      Object.entries(fieldMapping).filter(([, value]) => normalize(value))
    ),
    recommended_images: recommendedImages,
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
  const [handledSnapshotKey, setHandledSnapshotKey] = useState("");
  const { isAuthenticated } = useAuth();

  const activeDraft = result?.brochure_draft || localDraft;
  const images = result?.vision_analysis?.images || activeDraft?.recommended_images || [];
  const coverage = useMemo(() => makeCoverage(activeDraft), [activeDraft]);

  const snapshotStats = useMemo(() => {
    if (!initialSnapshot?.listing_url) return null;
    return {
      pairs: initialSnapshot.pairs?.length || 0,
      images: initialSnapshot.images?.length || 0,
      textLength: initialSnapshot.visible_text?.length || 0,
    };
  }, [initialSnapshot]);

  useEffect(() => {
    if (!initialUrl) return;
    setListingUrl(extractNaverLandUrl(initialUrl));
    setError("");
  }, [initialUrl]);

  useEffect(() => {
    if (!initialSnapshot?.listing_url) return;

    const snapshotKey = [
      initialSnapshot.listing_url,
      initialSnapshot.received_at || "",
      initialSnapshot.visible_text?.length || 0,
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
    setStatus("현재 네이버 화면에서 읽은 값으로 1차 자동기입했습니다. 비어 있는 항목은 아래 진단을 확인해주세요.");
    onApplyDraft?.(fallbackDraft);

    if (!isAuthenticated) {
      setError("로그인 전이라 서버/AI 초안 생성은 건너뛰었습니다. 현재 화면에서 읽은 값만 먼저 반영했습니다.");
      return;
    }

    let ignore = false;
    setLoading(true);

    importNaverSnapshot(initialSnapshot)
      .then((data) => {
        if (ignore) return;
        setResult(data);
        if (data?.brochure_draft) {
          onApplyDraft?.(data.brochure_draft);
          setStatus("서버 분석 결과까지 반영했습니다. 저장 전 값이 맞는지 확인해주세요.");
        }
      })
      .catch((err) => {
        console.error(err);
        if (!ignore) {
          setError(`서버 분석은 실패했지만, 현재 화면에서 읽은 값은 반영했습니다. (${err.message})`);
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [initialSnapshot, isAuthenticated, handledSnapshotKey, onApplyDraft]);

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
          <p>메인 방식은 현재 보고 있는 네이버 화면을 읽어와 자동기입하는 것입니다.</p>
        </div>
        <span className="agent-pill">Agent MVP</span>
      </div>

      <div className="import-flow-card">
        <strong>추천 흐름</strong>
        <ol className="import-flow-steps">
          <li>네이버 부동산에서 실제 매물 상세 패널을 엽니다.</li>
          <li>사진 탭이나 상세 정보가 보이는 상태에서 오른쪽 아래 업무툴 버튼을 누릅니다.</li>
          <li>가져온 값은 초안으로만 반영하고, 저장 전 사람이 확인합니다.</li>
        </ol>
      </div>

      {snapshotStats && (
        <div className="import-debug-box">
          <strong>확장 데이터 수신됨</strong>
          <span>표 후보 {snapshotStats.pairs}개</span>
          <span>이미지 후보 {snapshotStats.images}개</span>
          <span>화면 텍스트 {snapshotStats.textLength.toLocaleString()}자</span>
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
          URL 방식은 서버가 네이버를 다시 열어야 해서 timeout이 날 수 있습니다. 서비스 메인 흐름은
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
