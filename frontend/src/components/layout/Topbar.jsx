import { useAuth } from "../../auth/AuthContext";

function Topbar({ onNavigate }) {
  const { user, logout, isAuthenticated } = useAuth();
  const displayName =
    user?.manager_name ||
    user?.office_name ||
    (user?.email ? user.email.split("@")[0] : "") ||
    user?.username ||
    "사용자";

  return (
    <header className="topbar">
      <div className="topbar-title">
        <strong>AgentNote</strong>
      </div>

      <div className="topbar-actions">
        {isAuthenticated ? (
          <>
            <button type="button" className="topbar-link" onClick={() => onNavigate?.("profile")}>
              내 정보
            </button>
            <span className="user-avatar">{displayName}</span>
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
