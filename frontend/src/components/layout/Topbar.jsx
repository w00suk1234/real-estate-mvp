import { useAuth } from "../../auth/AuthContext";

function Topbar() {
  const { user, logout } = useAuth();
  const avatarText = user?.username?.slice(0, 2).toUpperCase() || "ME";

  return (
    <header className="topbar">
      <div className="topbar-title">부동산 업무 도구</div>

      <div className="topbar-right">
        <input className="topbar-search" placeholder="검색..." />
        <span className="role-pill">{user?.role || "viewer"}</span>
        <div className="avatar">{avatarText}</div>
        <button className="logout-btn" type="button" onClick={logout}>
          로그아웃
        </button>
      </div>
    </header>
  );
}

export default Topbar;
