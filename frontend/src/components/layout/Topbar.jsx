import { useAuth } from "../../auth/AuthContext";

const pageMeta = {
  schedules: { eyebrow: "일정관리", title: "일정과 고객 흐름을 한 화면에서 관리합니다" },
  customers: { eyebrow: "고객관리", title: "고객 목록과 상담 흐름을 정리합니다" },
  "ai-recommend": { eyebrow: "AI 매물 추천기", title: "고객 조건에 맞는 매물을 빠르게 추천합니다" },
  settlement: { eyebrow: "정산", title: "월별 인입, 계약, 수수료 매출을 정리합니다" },
  briefing: { eyebrow: "소개서 작성", title: "매물 정보를 고객용 소개서로 정리합니다" },
  profile: { eyebrow: "내 정보 관리", title: "소개서 하단에 표시될 담당자 정보를 관리합니다" },
  calculators: { eyebrow: "계산기", title: "중개보수와 임대료를 빠르게 계산합니다" },
  "photo-editor": { eyebrow: "사진 편집기", title: "사진 밝기와 문구를 간단히 보정합니다" },
  "address-hub": { eyebrow: "주소 / 지번 허브", title: "지도와 공적 문서 사이트를 빠르게 엽니다" },
};

function Topbar({ page, onNavigate }) {
  const { user, logout, isAuthenticated } = useAuth();
  const meta = pageMeta[page] || pageMeta.briefing;
  const initials = (user?.manager_name || user?.username || user?.email || "AN").slice(0, 3).toUpperCase();

  return (
    <header className="topbar">
      <div className="topbar-title">
        <span>{meta.eyebrow}</span>
        <strong>{meta.title}</strong>
      </div>

      <div className="topbar-actions">
        {isAuthenticated ? (
          <>
            <button type="button" className="topbar-link" onClick={() => onNavigate?.("profile")}>
              내 정보
            </button>
            <span className="role-pill">{user?.role || "user"}</span>
            <span className="user-avatar">{initials}</span>
            <button type="button" className="auth-btn logout-clean-btn" onClick={logout}>
              로그아웃
            </button>
          </>
        ) : (
          <button type="button" className="auth-btn" onClick={() => onNavigate?.("login")}>
            로그인 / 회원가입
          </button>
        )}
      </div>
    </header>
  );
}

export default Topbar;
