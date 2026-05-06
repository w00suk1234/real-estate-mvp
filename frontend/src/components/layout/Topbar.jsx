import { useAuth } from "../../auth/AuthContext";

function Topbar({ onNavigate }) {
  const { user, logout, isAuthenticated } = useAuth();
  const initials = (user?.manager_name || user?.username || user?.email || "AN").slice(0, 3).toUpperCase();

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
