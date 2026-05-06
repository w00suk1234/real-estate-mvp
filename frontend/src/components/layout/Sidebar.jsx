import icon1 from "../../assets/icon1.png";

const primaryItems = [
  { id: "schedules", label: "일정관리" },
  { id: "customers", label: "고객관리" },
  { id: "ai-recommend", label: "AI 매물 추천기", icon: "AI" },
  { id: "settlement", label: "정산" },
  { id: "briefing", label: "소개서 작성" },
];

const secondaryItems = [
  { id: "profile", label: "내 정보 관리" },
  { id: "calculators", label: "계산기" },
  { id: "photo-editor", label: "사진 편집기" },
  { id: "address-hub", label: "주소 / 지번 허브" },
];

function Sidebar({ page, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand" role="button" tabIndex={0} onClick={() => onNavigate?.("schedules")}>
        <img className="sidebar-logo" src={icon1} alt="AgentNote" />
        <div className="sidebar-brand-copy">
          <strong>AgentNote</strong>
          <span>부동산 업무 통합툴</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="주요 메뉴">
        {primaryItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${page === item.id ? "active" : ""}`}
            onClick={() => onNavigate?.(item.id)}
          >
            {item.icon ? <span className="nav-item-icon">{item.icon}</span> : null}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav sidebar-nav-secondary" aria-label="보조 메뉴">
        {secondaryItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${page === item.id ? "active" : ""}`}
            onClick={() => onNavigate?.(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
