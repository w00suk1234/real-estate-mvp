import icon1 from "../../assets/icon1.png";

const primaryNavItems = [
  { key: "schedules", label: "일정관리", shortLabel: "일정" },
  { key: "customers", label: "고객관리", shortLabel: "고객" },
  { key: "briefing", label: "소개서 작성", shortLabel: "소개" },
];

const secondaryNavItems = [
  { key: "profile", label: "내 정보 관리", shortLabel: "정보" },
  { key: "calculators", label: "계산기", shortLabel: "계산" },
  { key: "photo-editor", label: "사진 편집기", shortLabel: "사진" },
  { key: "address-hub", label: "주소 / 지번 허브", shortLabel: "주소" },
];

function Sidebar({ page, onNavigate, onResetBriefing }) {
  return (
    <aside className="sidebar">
      <button
        type="button"
        className="sidebar-brand"
        onClick={() => onNavigate?.("schedules")}
      >
        <img src={icon1} alt="부동산 업무툴 로고" className="sidebar-logo" />
        <span className="sidebar-brand-copy">
          <strong>부동산 업무툴</strong>
          <span>중개 실무 보조 도구</span>
        </span>
      </button>

      <nav className="sidebar-nav" aria-label="주요 메뉴">
        <div className="sidebar-nav-group">
          {primaryNavItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav-item ${page === item.key ? "active" : ""}`}
              onClick={() => onNavigate?.(item.key)}
              title={item.label}
            >
              <span className="nav-item-text">{item.label}</span>
              <span className="nav-item-short">{item.shortLabel}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-nav-group sidebar-nav-secondary">
          {secondaryNavItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav-item ${page === item.key ? "active" : ""}`}
              onClick={() => onNavigate?.(item.key)}
              title={item.label}
            >
              <span className="nav-item-text">{item.label}</span>
              <span className="nav-item-short">{item.shortLabel}</span>
            </button>
          ))}
        </div>
      </nav>

      <button
        type="button"
        className="sidebar-cta"
        onClick={() => onResetBriefing?.()}
      >
        <span className="nav-item-text">새 업무 시작</span>
        <span className="nav-item-short">새 업무</span>
      </button>
    </aside>
  );
}

export default Sidebar;
