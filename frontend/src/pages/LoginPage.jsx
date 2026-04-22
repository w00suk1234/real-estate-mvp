import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import "../styles/auth.css";

function LoginPage({ setPage }) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState("login");
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
      if (mode === "signup") {
        await signup(form);
      } else {
        await login(form);
      }
      setPage?.("briefing");
    } catch (err) {
      setError(err.message || "처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const isSignup = mode === "signup";

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-eyebrow">REAL ESTATE MVP</p>
        <h1>{isSignup ? "회원가입" : "로그인"}</h1>
        <p className="auth-copy">
          계산기와 주소 도구는 바로 쓸 수 있고, 매물/고객/일정 저장은 로그인 후 사용할 수 있습니다.
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            로그인
          </button>
          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            onClick={() => setMode("signup")}
          >
            회원가입
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            아이디
            <input
              value={form.username}
              onChange={(e) => updateField("username", e.target.value)}
              autoComplete="username"
              autoFocus
              required
              minLength={3}
            />
          </label>

          <label>
            비밀번호
            <input
              type="password"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={8}
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "처리 중..." : isSignup ? "가입하고 시작" : "로그인"}
          </button>
        </form>

        <button className="auth-skip" type="button" onClick={() => setPage?.("calculators")}>
          로그인 없이 계산기 먼저 써보기
        </button>
      </section>
    </main>
  );
}

export default LoginPage;
