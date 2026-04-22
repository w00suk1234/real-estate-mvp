import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import "../styles/auth.css";

function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(form);
    } catch (err) {
      setError(err.message || "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-eyebrow">PRIVATE REAL ESTATE MVP</p>
        <h1>부동산 업무 도구</h1>
        <p className="auth-copy">
          미리 등록된 계정만 접속할 수 있는 폐쇄형 테스트 앱입니다.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            아이디
            <input
              value={form.username}
              onChange={(e) => updateField("username", e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </label>

          <label>
            비밀번호
            <input
              type="password"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default LoginPage;
