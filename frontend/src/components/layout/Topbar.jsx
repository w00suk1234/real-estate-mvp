import { useMemo } from "react";
import { useAuth } from "../../auth/AuthContext";

function getInitials(user) {
  const source =
    user?.manager_name?.trim() || user?.office_name?.trim() || user?.username?.trim() || "U";
  return source.slice(0, 2).toUpperCase();
}

function Topbar({ onNavigate }) {
  const { user, logout } = useAuth();

  const roleLabel = useMemo(() => {
    if (!user) return "";
    return user.role === "admin" ? "관리자" : "일반회원";
  }, [user]);

  const nameLabel =
    user?.manager_name?.trim() || user?.office_name?.trim() || user?.username?.trim() || "사용자";

  return (
    <header className="topbar">
      <div className="topbar-search">
        <input type="search" placeholder="검색..." disabled />
      </div>

      <div className="topbar-actions">
        {user ? (
          <>
            <span className="role-chip">{roleLabel}</span>
            <button type="button" className="topbar-link-btn" onClick={() => onNavigate("profile")}>
              내 정보
            </button>
            <div className="avatar-badge">{getInitials(user)}</div>
            <span className="topbar-user-name">{nameLabel}</span>
            <button type="button" className="ghost-btn" onClick={logout}>
              로그아웃
            </button>
          </>
        ) : (
          <button type="button" className="ghost-btn" onClick={() => onNavigate("login")}>
            로그인 / 회원가입
          </button>
        )}
      </div>
    </header>
  );
}

export default Topbar;
