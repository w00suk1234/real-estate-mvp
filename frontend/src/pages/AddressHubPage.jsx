import { useState } from "react";

function AddressHubPage() {
  const [query, setQuery] = useState("");

  const openMap = () => {
    if (!query.trim()) {
      window.alert("주소 또는 지번을 입력하세요.");
      return;
    }
    window.open(
      `https://map.naver.com/p/search/${encodeURIComponent(query.trim())}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const openBuilding = () => {
    window.open("https://www.gov.kr/", "_blank", "noopener,noreferrer");
  };

  const openRegister = () => {
    window.open("https://www.iros.go.kr/", "_blank", "noopener,noreferrer");
  };

  const openLand = () => {
    window.open("https://land.seoul.go.kr/", "_blank", "noopener,noreferrer");
  };

  return (
    <div className="page-stack page-narrow">
      <section className="page-header-card">
        <span className="section-eyebrow">주소 / 지번 허브</span>
        <h1>주소 / 지번 허브</h1>
        <p>주소와 지번을 기준으로 지도와 외부 문서 사이트를 빠르게 엽니다.</p>
      </section>

      <section className="panel address-hub-card">
        <div className="panel-head">
          <h3>주소 / 지번 입력</h3>
          <p>자주 확인하는 지도, 건축물대장, 등기 사이트를 한 번에 엽니다.</p>
        </div>

        <div className="form-box">
          <label className="field">
            <span>주소 또는 지번</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="예: 서울시 강남구 역삼동 123-45"
            />
          </label>

          <div className="address-button-grid">
            <button type="button" className="primary-btn" onClick={openMap}>
              지도 바로가기
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
    </div>
  );
}

export default AddressHubPage;
