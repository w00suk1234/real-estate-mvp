import { useAuth } from "../../auth/AuthContext";

function Topbar({ setPage }) {
  const { user, isAuthenticated, logout } = useAuth();
  const avatarText = user?.username?.slice(0, 2).toUpperCase() || "ME";
  const roleText = user?.role === "admin" ? "admin" : "user";

  const handleLogout = () => {
    logout();
    setPage?.("calculators");
  };

  return (
    <header className="topbar">
      <div className="topbar-title">부동산 업무툴</div>

      <div className="topbar-right">
        {isAuthenticated ? (
          <>
            <span className="role-pill">{roleText}</span>
            <div className="avatar">{avatarText}</div>
            <button className="logout-btn" type="button" onClick={handleLogout}>
              로그아웃
            </button>
          </>
        ) : (
          <button
            className="logout-btn"
            type="button"
            onClick={() => setPage?.("auth")}
          >
            로그인 / 회원가입
          </button>
        )}
      </div>
    </header>
  );
}

export default Topbar;
