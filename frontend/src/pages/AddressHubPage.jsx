import { useState } from "react";

function AddressHubPage() {
  const [query, setQuery] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

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

  const copyAddress = async () => {
    if (!query.trim()) {
      window.alert("복사할 주소 또는 지번을 입력하세요.");
      return;
    }
    try {
      await navigator.clipboard.writeText(query.trim());
      setCopyMessage("주소를 복사했습니다.");
      window.setTimeout(() => setCopyMessage(""), 1600);
    } catch {
      setCopyMessage("복사에 실패했습니다. 주소를 직접 선택해 주세요.");
    }
  };

  return (
    <div className="page-stack support-workspace address-hub-workspace">
      <section className="page-header-card support-header">
        <div>
          <span className="section-eyebrow">주소 / 지번 허브</span>
          <h1>주소 / 지번 허브</h1>
          <p>주소, 지번, 매물 위치 정보를 빠르게 확인합니다.</p>
        </div>
      </section>

      <section className="panel address-hub-card support-card address-search-card">
        <div className="panel-head support-card-heading">
          <h3>주소 / 지번 입력</h3>
          <p>검색창에 주소를 입력한 뒤 지도, 건축물대장, 등기 사이트로 바로 이동합니다.</p>
        </div>

        <div className="form-box">
          <label className="field address-main-search">
            <span>주소 또는 지번</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="예: 서울시 강남구 역삼동 123-45"
            />
          </label>

          <div className="address-query-preview">
            <span>현재 입력</span>
            <strong>{query.trim() || "주소 또는 지번을 입력하면 여기에 표시됩니다."}</strong>
            {copyMessage ? <em>{copyMessage}</em> : null}
          </div>

          <div className="address-button-grid">
            <button type="button" className="primary-btn" onClick={openMap}>
              지도 바로가기
            </button>
            <button type="button" className="secondary-btn" onClick={copyAddress}>
              주소 복사
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
