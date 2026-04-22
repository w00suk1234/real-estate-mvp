import LoginPage from "../pages/LoginPage";
import { useAuth } from "./AuthContext";

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-eyebrow">LOCAL MVP</p>
          <h1>로그인 확인 중</h1>
          <p className="auth-copy">저장된 로그인 정보를 확인하고 있습니다.</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return children;
}

export default ProtectedRoute;
