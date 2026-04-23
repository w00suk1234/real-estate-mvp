import { useEffect, useMemo, useState } from "react";
import { importNaverListing, importNaverSnapshot } from "../../api";
import { useAuth } from "../../auth/AuthContext";

const NAVER_LAND_URL = "https://new.land.naver.com/";

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractNaverLandUrl(value) {
  const trimmed = value.trim();
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

function firstNumber(value) {
  const match = String(value || "").match(/[\d,.]+/);
  return match ? match[0].replace(",", "") : "";
}

function inferTitle(snapshot, text) {
  const rawTitle = normalize(snapshot?.title);
  if (rawTitle && !rawTitle.includes("네이버") && rawTitle.length < 80) {
    return rawTitle;
  }

  return firstRegex(text, [
    /([가-힣A-Za-z0-9·\s]+(?:단지|상가|오피스텔|아파트|빌딩)\s*\d{0,4}동?)/,
    /([가-힣A-Za-z0-9·\s]+(?:매매|전세|월세)\s*[\d,.]+[^\n]{0,30})/,
  ]);
}

function buildLocalDraftFromSnapshot(snapshot) {
  const table = makePairTable(snapshot);
  const text = normalize(snapshot?.visible_text);
  const title = inferTitle(snapshot, text) || "네이버 부동산 매물";
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
    firstRegex(text, [/([/\d,.]+\s*㎡)/, /면적\s*([^\n]{2,80})/]);

  const areaNumbers = areaText.match(/[\d,.]+/g) || [];
  const supplyArea = areaNumbers[0]?.replace(",", "") || "";
  const exclusiveArea = areaNumbers[1]?.replace(",", "") || "";

  const floor =
    findByAliases(table, ["층수", "해당층", "층"]) ||
    firstRegex(text, [/(\d+\s*\/\s*\d+\s*층)/, /(\d+\s*층\s*\/\s*\d+\s*층)/]);

  const priceText = firstRegex(text, [
    /(월세\s*[\d,.]+\s*\/\s*[\d,.]+)/,
    /(매매\s*[\d,.]+[^\s]{0,8})/,
    /(전세\s*[\d,.]+[^\s]{0,8})/,
  ]);

  const priceNumbers = priceText.match(/[\d,.]+/g) || [];
  const dealType = priceText.includes("전세")
    ? "전세"
    : priceText.includes("매매")
      ? "매매"
      : "월세";

  const fieldMapping = {
    title,
    deal_type: dealType,
    address,
    supply_area: supplyArea,
    exclusive_area: exclusiveArea,
    floor,
    deposit: priceNumbers[0]?.replace(",", "") || "",
    monthly_rent: dealType === "월세" ? priceNumbers[1]?.replace(",", "") || "" : "",
    description: [
      priceText,
      address,
      areaText ? `면적 ${areaText}` : "",
      floor ? `층수 ${floor}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };

  const recommendedImages = (snapshot?.images || [])
    .filter((image) => image.url)
    .slice(0, 10)
    .map((image) => ({
      ...image,
      category: image.category || "naver_image",
      confidence: image.confidence || 0.5,
    }));

  return {
    brochure_title: title,
    summary_points: [address, priceText, areaText, floor].filter(Boolean),
    field_mapping: Object.fromEntries(
      Object.entries(fieldMapping).filter(([, value]) => normalize(value))
    ),
    recommended_images: recommendedImages,
    warnings: [],
  };
}

function NaverImportPanel({ initialUrl = "", initialSnapshot = null, onApplyDraft }) {
  const [listingUrl, setListingUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [handledSnapshotKey, setHandledSnapshotKey] = useState("");
  const { isAuthenticated } = useAuth();

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

    setListingUrl(extractNaverLandUrl(initialSnapshot.listing_url));
    setHandledSnapshotKey(snapshotKey);
    setError("");
    setStatus("확장프로그램 데이터 수신 완료. 화면에서 1차 자동기입 중입니다.");

    const localDraft = buildLocalDraftFromSnapshot(initialSnapshot);
    onApplyDraft?.(localDraft);

    if (!isAuthenticated) {
      setError("로그인 후 서버 분석까지 진행할 수 있습니다. 현재는 화면에서 읽은 값만 1차 반영했습니다.");
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
          setStatus("서버 분석 결과까지 반영했습니다. 저장 전 값은 꼭 확인하세요.");
        }
      })
      .catch((err) => {
        console.error(err);
        if (!ignore) {
          setError(
            `서버 분석은 실패했습니다. 그래도 화면에서 읽은 값은 1차 반영했습니다. (${err.message})`
          );
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
      const url = extractNaverLandUrl(text);
      setListingUrl(url);
      setError("");
    } catch {
      setError("브라우저가 클립보드 읽기를 막았습니다. 복사한 URL을 직접 붙여넣어 주세요.");
    }
  };

  const handleImport = async () => {
    if (!isAuthenticated) {
      setError("네이버 매물 가져오기는 로그인 후 사용할 수 있습니다.");
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
      if (data?.brochure_draft) onApplyDraft?.(data.brochure_draft);
    } catch (err) {
      console.error(err);
      setError(
        `${err.message || "매물 가져오기 중 오류가 발생했습니다."} URL 입력 방식은 서버가 네이버를 직접 여는 예비 기능이라 실패할 수 있습니다. 네이버 페이지의 업무툴로 가져오기 버튼을 추천합니다.`
      );
    } finally {
      setLoading(false);
    }
  };

  const draft = result?.brochure_draft;
  const images = result?.vision_analysis?.images || [];

  return (
    <section className="panel import-panel">
      <div className="panel-head import-panel-head">
        <div>
          <h3>네이버 매물 가져오기</h3>
          <p>추천 방식은 네이버 화면 오른쪽 아래의 업무툴로 가져오기 버튼입니다.</p>
        </div>
        <span className="agent-pill">Agent MVP</span>
      </div>

      <div className="import-alert">
        팩트: 네이버 공식 API가 아니라 화면을 읽는 방식이라 100% 정확하지 않습니다.
        가져온 값은 초안으로 보고 저장 전 확인해야 합니다.
      </div>

      {snapshotStats && (
        <div className="import-debug-box">
          <strong>확장프로그램 수신 상태</strong>
          <span>필드 후보 {snapshotStats.pairs}개</span>
          <span>이미지 후보 {snapshotStats.images}개</span>
          <span>텍스트 {snapshotStats.textLength.toLocaleString()}자</span>
        </div>
      )}

      {status && <div className="import-alert success">{status}</div>}

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
          onClick={handleImport}
          disabled={loading}
        >
          {loading ? "분석 중..." : "URL로 가져오기"}
        </button>
      </div>

      <p className="import-helper">
        URL 버튼은 예비 기능입니다. 네이버 화면에서 매물 상세를 연 뒤 오른쪽 아래 업무툴로 가져오기 버튼을 누르는 편이 더 낫습니다.
      </p>

      {error && <div className="import-alert danger">{error}</div>}

      {draft && (
        <div className="import-result">
          <div className="import-result-top">
            <div>
              <strong>{draft.brochure_title}</strong>
              <p>{draft.summary_points?.join(" · ")}</p>
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => onApplyDraft?.(draft)}
            >
              다시 반영
            </button>
          </div>

          {draft.warnings?.length > 0 && (
            <div className="import-alert">
              {draft.warnings.slice(0, 3).map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}

          {images.length > 0 && (
            <div className="import-image-strip">
              {images.slice(0, 6).map((image) => (
                <a
                  key={image.url}
                  href={image.url}
                  target="_blank"
                  rel="noreferrer"
                  className="import-image-item"
                >
                  <span>{image.category}</span>
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
