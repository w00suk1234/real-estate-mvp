function Sidebar({ page, setPage }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">CP</div>
        <div>
          <h2>큐레이터 프로</h2>
          <p>중개 업무 보조 도구</p>
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
        <button className="primary-side-btn">새 업무 시작</button>
      </div>
    </aside>
  );
}

export default Sidebar;