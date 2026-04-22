import appIcon from "../../assets/icon1.png";

function Sidebar({ page, setPage }) {
  const startNewWork = () => {
    const hasWork = sessionStorage.getItem("briefing_has_work") === "1";
    if (
      hasWork &&
      !window.confirm("작성 중인 내용이 초기화됩니다. 새 업무를 시작할까요?")
    ) {
      return;
    }

    sessionStorage.setItem("briefing_reset_pending", "1");
    window.dispatchEvent(new Event("briefing:new"));
    setPage("briefing");
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo" aria-hidden="true">
          <img src={appIcon} alt="" />
        </div>
        <div>
          <h2>부동산 업무툴</h2>
          <p>중개 실무 보조 도구</p>
        </div>
      </div>

      <nav className="nav-menu">
        <button
          className={`nav-item ${page === "briefing" ? "active" : ""}`}
          onClick={() => setPage("briefing")}
        >
          소개서 작성
        </button>

        <button
          className={`nav-item ${page === "customers" ? "active" : ""}`}
          onClick={() => setPage("customers")}
        >
          고객 관리
        </button>

        <button
          className={`nav-item ${page === "schedules" ? "active" : ""}`}
          onClick={() => setPage("schedules")}
        >
          일정 관리
        </button>

        <button
          className={`nav-item ${page === "calculators" ? "active" : ""}`}
          onClick={() => setPage("calculators")}
        >
          계산기
        </button>

        <button
          className={`nav-item ${page === "photo-editor" ? "active" : ""}`}
          onClick={() => setPage("photo-editor")}
        >
          사진 편집기
        </button>

        <button
          className={`nav-item ${page === "address-hub" ? "active" : ""}`}
          onClick={() => setPage("address-hub")}
        >
          주소 / 지번 허브
        </button>
      </nav>

      <div className="sidebar-bottom">
        <button className="primary-side-btn" onClick={startNewWork}>
          새 업무 시작
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
