import { useState } from "react";
import { importNaverListing } from "../../api";
import { useAuth } from "../../auth/AuthContext";

function NaverImportPanel({ onApplyDraft }) {
  const [listingUrl, setListingUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const { isAuthenticated } = useAuth();

  const handleImport = async () => {
    if (!isAuthenticated) {
      setError("네이버 매물 가져오기는 로그인 후 사용할 수 있습니다.");
      return;
    }

    if (!listingUrl.trim()) {
      setError("네이버 부동산 매물 URL을 입력해주세요.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const data = await importNaverListing(listingUrl.trim());
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
          <p>URL을 읽어 매물정보를 추출하고 소개서 입력값 초안을 만듭니다.</p>
        </div>
        <span className="agent-pill">Agent MVP</span>
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
