import { useAuth } from "../../auth/AuthContext";

const pageMeta = {
  schedules: {
    eyebrow: "부동산 업무툴",
    title: "중개 일정을 한 화면에서 관리합니다",
  },
  customers: {
    eyebrow: "고객관리",
    title: "고객 목록과 상담 흐름을 정리합니다",
  },
  briefing: {
    eyebrow: "소개서 작성",
    title: "네이버 매물 정보를 고객용 소개서로 정리합니다",
  },
  profile: {
    eyebrow: "회원정보",
    title: "소개서 하단에 표시될 담당자 정보를 관리합니다",
  },
  calculators: {
    eyebrow: "계산기",
    title: "중개보수와 임대료 일할 계산을 빠르게 확인합니다",
  },
  "photo-editor": {
    eyebrow: "사진 편집기",
    title: "매물 사진을 간단히 보정합니다",
  },
  "address-hub": {
    eyebrow: "주소 / 지번 허브",
    title: "주소 기반 외부 업무 사이트를 빠르게 엽니다",
  },
};

function getInitials(user) {
  const source = user?.manager_name || user?.username || user?.email || "U";
  return String(source).slice(0, 2).toUpperCase();
}

function Topbar({ page, onNavigate }) {
  const { user, isAuthenticated, logout } = useAuth();
  const meta = pageMeta[page] || pageMeta.briefing;

  const handleLogout = () => {
    logout();
    onNavigate?.("briefing");
  };

  return (
    <header className="topbar">
      <div className="topbar-title-block">
        <span className="topbar-eyebrow">{meta.eyebrow}</span>
        <strong>{meta.title}</strong>
      </div>

      <div className="topbar-actions">
        {isAuthenticated ? (
          <>
            <button type="button" className="topbar-link" onClick={() => onNavigate?.("profile")}>
              내 정보
            </button>
            <span className="role-pill">{user?.role === "admin" ? "admin" : "user"}</span>
            <span className="avatar" title={user?.username || user?.email || "user"}>
              {getInitials(user)}
            </span>
            <button type="button" className="logout-btn" onClick={handleLogout}>
              로그아웃
            </button>
          </>
        ) : (
          <button type="button" className="login-btn" onClick={() => onNavigate?.("login")}>
            로그인 / 회원가입
          </button>
        )}
      </div>
    </header>
  );
}

export default Topbar;
