import { useEffect, useState } from "react";
import { importNaverListing } from "../../api";
import { useAuth } from "../../auth/AuthContext";

const NAVER_LAND_URL = "https://new.land.naver.com/";

function extractNaverLandUrl(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/https?:\/\/(?:new\.)?land\.naver\.com[^\s"'<>)]*/i);
  return match?.[0] || trimmed;
}

function NaverImportPanel({ initialUrl = "", onApplyDraft }) {
  const [listingUrl, setListingUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!initialUrl) return;
    setListingUrl(extractNaverLandUrl(initialUrl));
    setError("");
  }, [initialUrl]);

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
    } catch (err) {
      console.error(err);
      setError(err.message || "매물 가져오기 중 오류가 발생했습니다.");
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
          <p>네이버에서 매물 상세를 열고 주소를 복사한 뒤 붙여넣으면 소개서 초안을 만듭니다.</p>
        </div>
        <span className="agent-pill">Agent MVP</span>
      </div>

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
          {loading ? "수집 중..." : "가져오기"}
        </button>
      </div>

      <p className="import-helper">
        매물 상세가 열린 상태의 주소가 가장 좋습니다. 목록 URL이면 일부 정보가 비어 있을 수 있습니다.
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
              소개서 폼에 반영
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
