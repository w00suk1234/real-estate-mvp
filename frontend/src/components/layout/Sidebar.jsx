import icon1 from "../../assets/icon1.png";

const primaryItems = [
  { id: "schedules", label: "일정관리" },
  { id: "customers", label: "고객관리" },
  { id: "ai-recommend", label: "AI 매물 추천기" },
  { id: "settlements", label: "정산" },
  { id: "briefing", label: "소개서 작성" },
];

const secondaryItems = [
  { id: "profile", label: "내 정보 관리" },
  { id: "calculators", label: "계산기" },
  { id: "photo-editor", label: "사진 편집기" },
  { id: "address-hub", label: "주소 / 지번 허브" },
];

function Sidebar({ page, onNavigate, onResetBriefing }) {
  const handleReset = () => {
    const confirmed = window.confirm("작성 중인 소개서 내용을 초기화하고 새 업무를 시작할까요?");
    if (confirmed) {
      onResetBriefing?.();
    }
  };

  const isActive = (item) => page === item.id || (item.id === "settlements" && page === "settlement");

  const renderItem = (item) => (
    <button
      key={item.id}
      type="button"
      className={isActive(item) ? "sidebar-item active" : "sidebar-item"}
      onClick={() => onNavigate(item.id)}
    >
      {item.label}
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src={icon1} alt="AgentNote" className="brand-logo" />
        <div>
          <strong>AgentNote</strong>
          <span>부동산 중개업무 통합툴</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="주요 메뉴">
        {primaryItems.map(renderItem)}
        <div className="sidebar-divider" />
        {secondaryItems.map(renderItem)}
      </nav>

      <button type="button" className="new-task-button" onClick={handleReset}>
        새 업무 시작
      </button>
    </aside>
  );
}

export default Sidebar;
