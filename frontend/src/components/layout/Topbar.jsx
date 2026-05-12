import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";

function Topbar({ page, onNavigate }) {
  const { user, logout, isAuthenticated } = useAuth();
  const [logoutNotice, setLogoutNotice] = useState("");
  const isTeamModeActive = page === "team-mode";
  const displayName =
    user?.manager_name ||
    user?.office_name ||
    (user?.email ? user.email.split("@")[0] : "") ||
    user?.username ||
    "사용자";

  useEffect(() => {
    if (!logoutNotice) return undefined;
    const timer = window.setTimeout(() => setLogoutNotice(""), 2500);
    return () => window.clearTimeout(timer);
  }, [logoutNotice]);

  async function handleLogout() {
    await logout();
    setLogoutNotice("안전하게 로그아웃되었습니다.");
  }

  function handleTeamModeToggle() {
    onNavigate?.(isTeamModeActive ? "schedules" : "team-mode");
  }

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
            <button
              type="button"
              className={`team-mode-debug-toggle ${isTeamModeActive ? "active" : ""}`}
              role="switch"
              aria-checked={isTeamModeActive}
              onClick={handleTeamModeToggle}
              title="임시 디버깅용 팀플모드 전환"
            >
              <span className="team-mode-debug-copy">팀플모드</span>
              <span className="team-mode-debug-track" aria-hidden="true">
                <span className="team-mode-debug-knob" />
              </span>
            </button>
            <span className="user-avatar">{displayName}</span>
            <button type="button" className="auth-btn logout-clean-btn" onClick={handleLogout}>
              로그아웃
            </button>
          </>
        ) : (
          <button type="button" className="auth-btn" onClick={() => onNavigate?.("login")}>
            로그인 / 회원가입
          </button>
        )}
      </div>
      {logoutNotice ? <div className="topbar-toast" role="status">{logoutNotice}</div> : null}
    </header>
  );
}

export default Topbar;
