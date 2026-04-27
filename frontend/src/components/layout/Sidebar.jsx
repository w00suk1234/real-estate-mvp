import brandIcon from "../../assets/icon1.png";

const primaryItems = [
  { key: "schedules", label: "일정관리" },
  { key: "customers", label: "고객관리" },
  { key: "briefing", label: "소개서 작성" },
];

const secondaryItems = [
  { key: "profile", label: "내 정보 관리" },
  { key: "calculators", label: "계산기" },
  { key: "photo-editor", label: "사진 편집기" },
  { key: "address-hub", label: "주소 / 지번 허브" },
];

function Sidebar({ page, onNavigate, onResetBriefing }) {
  return (
    <aside className="sidebar">
      <div className="brand-card">
        <div className="brand-logo-box">
          <img src={brandIcon} alt="부동산 업무툴 로고" />
        </div>
        <div className="brand-copy">
          <div className="brand-name">부동산 업무툴</div>
          <div className="brand-subtitle">중개 실무 보조 도구</div>
        </div>
      </div>

      <nav className="nav-menu nav-menu-primary">
        {primaryItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-item ${page === item.key ? "active" : ""}`}
            onClick={() => onNavigate(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <nav className="nav-menu nav-menu-secondary">
        {secondaryItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-item ${page === item.key ? "active" : ""}`}
            onClick={() => onNavigate(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <button type="button" className="primary-side-btn sidebar-cta" onClick={onResetBriefing}>
        새 업무 시작
      </button>
    </aside>
  );
}

export default Sidebar;
