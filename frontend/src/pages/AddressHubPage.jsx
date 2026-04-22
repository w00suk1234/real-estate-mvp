import { useState } from "react";
import PageShell from "../components/layout/PageShell";

function AddressHubPage({ setPage }) {
  const [query, setQuery] = useState("");

  const openMap = () => {
    if (!query) return alert("주소나 지번을 입력하세요.");
    window.open(
      `https://map.naver.com/p/search/${encodeURIComponent(query)}`,
      "_blank"
    );
  };

  const openBuilding = () => {
    window.open("https://www.gov.kr/", "_blank");
  };

  const openRegister = () => {
    window.open("https://www.iros.go.kr/", "_blank");
  };

  const openLand = () => {
    window.open("https://land.seoul.go.kr/", "_blank");
  };

  return (
    <PageShell page="address-hub" setPage={setPage}>
      <div className="page-header">
        <p className="page-badge">주소 / 지번 허브</p>
        <h1>주소 / 지번 허브</h1>
        <p className="page-desc">
          주소와 지번을 기준으로 지도와 외부 문서 사이트를 빠르게 엽니다.
        </p>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>주소 / 지번 입력</h3>
          <p>자동 발급 전 단계의 1차 허브 화면입니다.</p>
        </div>

        <div className="form-box">
          <div className="field">
            <label>주소 또는 지번</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="예: 서울시 강남구 역삼동 123-45"
            />
          </div>

          <div className="address-button-grid">
            <button type="button" className="cta-btn" onClick={openMap}>
              지도 바로보기
            </button>
            <button type="button" className="secondary-btn" onClick={openBuilding}>
              건축물대장 사이트
            </button>
            <button type="button" className="secondary-btn" onClick={openRegister}>
              건물 / 토지 등기 사이트
            </button>
            <button type="button" className="secondary-btn" onClick={openLand}>
              서울 부동산 정보
            </button>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

export default AddressHubPage;