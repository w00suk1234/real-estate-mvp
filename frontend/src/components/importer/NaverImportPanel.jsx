import { useEffect, useState } from "react";
import { importNaverListing, importNaverSnapshot } from "../../api";
import { useAuth } from "../../auth/AuthContext";

const NAVER_LAND_URL = "https://new.land.naver.com/";

function extractNaverLandUrl(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/https?:\/\/(?:new\.)?land\.naver\.com[^\s"'<>)]*/i);
  return match?.[0] || trimmed;
}

function NaverImportPanel({ initialUrl = "", initialSnapshot = null, onApplyDraft }) {
  const [listingUrl, setListingUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [handledSnapshotKey, setHandledSnapshotKey] = useState("");
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!initialUrl) return;
    setListingUrl(extractNaverLandUrl(initialUrl));
    setError("");
  }, [initialUrl]);

  useEffect(() => {
    if (!initialSnapshot?.listing_url) return;

    const snapshotKey = [
      initialSnapshot.listing_url,
      initialSnapshot.visible_text?.length || 0,
      initialSnapshot.images?.length || 0,
      initialSnapshot.pairs?.length || 0,
    ].join(":");

    if (handledSnapshotKey === snapshotKey) return;

    setListingUrl(extractNaverLandUrl(initialSnapshot.listing_url));

    if (!isAuthenticated) {
      setError("로그인 후 확장 프로그램으로 가져온 매물을 자동 분석할 수 있습니다.");
      return;
    }

    let ignore = false;
    setHandledSnapshotKey(snapshotKey);
    setLoading(true);
    setError("");

    importNaverSnapshot(initialSnapshot)
      .then((data) => {
        if (!ignore) setResult(data);
      })
      .catch((err) => {
        console.error(err);
        if (!ignore) {
          setError(err.message || "확장 프로그램이 보낸 매물 정보를 처리하지 못했습니다.");
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [initialSnapshot, isAuthenticated, handledSnapshotKey]);

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
      setError(
        `${err.message || "매물 가져오기 중 오류가 발생했습니다."} URL 입력 방식은 서버가 네이버를 직접 여는 예비 기능이라 실패할 수 있습니다. 네이버 페이지에서 크롬 확장프로그램의 "Send to Work App"을 눌러 가져오는 방식을 추천합니다.`
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
          <p>추천 방식은 네이버 페이지에서 크롬 확장프로그램을 눌러 현재 화면을 가져오는 것입니다.</p>
        </div>
        <span className="agent-pill">Agent MVP</span>
      </div>

      <div className="import-alert">
        URL을 직접 붙여넣는 방식은 서버가 네이버를 다시 열어보는 예비 기능이라 timeout이 날 수 있습니다.
        네이버에서 매물 상세 패널을 열고 확장프로그램의 <strong>Send to Work App</strong>을 누르는 방식이 더 안정적입니다.
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
          {loading ? "수집 중..." : "URL로 가져오기"}
        </button>
      </div>

      <p className="import-helper">
        추천 URL 형태는 매물 하나를 클릭한 뒤 주소창에 articleNo가 포함된 주소입니다. 그래도 실패하면 확장프로그램으로 가져오세요.
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
