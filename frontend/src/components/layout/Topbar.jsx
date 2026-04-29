import { useAuth } from "../../auth/AuthContext";

function Topbar({ onNavigate }) {
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar-title-block">
        <span className="topbar-eyebrow">부동산 업무툴</span>
        <strong>중개 실무를 한 화면에서 정리하는 업무 대시보드</strong>
      </div>

      <div className="topbar-actions">
        {isAuthenticated && user ? (
          <>
            <button
              type="button"
              className="topbar-link"
              onClick={() => onNavigate?.("profile")}
            >
              내 정보 관리
            </button>
            <div className="user-pill" aria-label="로그인 사용자 정보">
              <div className="user-pill-copy">
                <span className="user-pill-name">
                  {user.agent_name || user.username}
                </span>
                <span className="user-pill-role">
                  {user.role === "admin" ? "관리자" : "일반회원"}
                </span>
              </div>
            </div>
            <button type="button" className="logout-btn" onClick={logout}>
              로그아웃
            </button>
          </>
        ) : (
          <button
            type="button"
            className="login-btn"
            onClick={() => onNavigate?.("login")}
          >
            로그인 / 회원가입
          </button>
        )}
      </div>
    </header>
  );
}

export default Topbar;
