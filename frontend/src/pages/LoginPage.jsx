import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import "../styles/auth.css";

const initialSignupForm = {
  username: "",
  password: "",
  office_name: "",
  manager_name: "",
  phone: "",
  email: "",
  privacy_agreed: false,
};

function LoginPage({ setPage }) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState("login");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [signupForm, setSignupForm] = useState(initialSignupForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isSignup = mode === "signup";

  function updateLoginField(key, value) {
    setLoginForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateSignupField(key, value) {
    setSignupForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignup) {
        await signup(signupForm);
      } else {
        await login(loginForm);
      }
      setPage?.("schedules");
    } catch (err) {
      setError(err.message || "처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card auth-card-wide">
        <p className="auth-eyebrow">부동산 중개업무 통합툴</p>
        <h1>{isSignup ? "회원가입" : "로그인"}</h1>
        <p className="auth-copy">
          {isSignup
            ? "기본 계정 정보를 입력하면 고객, 일정, 소개서 저장 기능을 사용할 수 있습니다."
            : "계정으로 로그인하고 고객, 일정, 소개서 데이터를 관리하세요."}
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
            아이디 또는 이메일
            <input
              value={isSignup ? signupForm.username : loginForm.username}
              onChange={(event) =>
                isSignup
                  ? updateSignupField("username", event.target.value)
                  : updateLoginField("username", event.target.value)
              }
              autoComplete="username"
              autoFocus
              required
              minLength={3}
              placeholder="예: broker01 또는 broker@example.com"
            />
          </label>

          <label>
            비밀번호
            <input
              type="password"
              value={isSignup ? signupForm.password : loginForm.password}
              onChange={(event) =>
                isSignup
                  ? updateSignupField("password", event.target.value)
                  : updateLoginField("password", event.target.value)
              }
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={8}
              placeholder="8자 이상 입력"
            />
          </label>

          {isSignup ? (
            <>
              <div className="auth-grid two">
                <label>
                  부동산 이름
                  <input
                    value={signupForm.office_name}
                    onChange={(event) => updateSignupField("office_name", event.target.value)}
                    placeholder="예: 역삼 프라임 공인중개사"
                  />
                </label>

                <label>
                  담당자명
                  <input
                    value={signupForm.manager_name}
                    onChange={(event) => updateSignupField("manager_name", event.target.value)}
                    placeholder="예: 김중개"
                  />
                </label>
              </div>

              <div className="auth-grid two">
                <label>
                  연락처
                  <input
                    value={signupForm.phone}
                    onChange={(event) => updateSignupField("phone", event.target.value)}
                    placeholder="예: 010-1234-5678"
                  />
                </label>

                <label>
                  이메일
                  <input
                    type="email"
                    value={signupForm.email}
                    onChange={(event) => updateSignupField("email", event.target.value)}
                    placeholder="예: broker@example.com"
                  />
                </label>
              </div>

              <label className="auth-checkbox">
                <input
                  type="checkbox"
                  checked={signupForm.privacy_agreed}
                  onChange={(event) => updateSignupField("privacy_agreed", event.target.checked)}
                  required
                />
                <span>개인정보 수집 및 이용에 동의합니다.</span>
              </label>
            </>
          ) : null}

          {error ? <div className="auth-error">{error}</div> : null}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "처리 중..." : isSignup ? "가입하기" : "로그인"}
          </button>
        </form>

        <button className="auth-skip" type="button" onClick={() => setPage?.("calculators")}>
          로그인 없이 계산기 먼저 보기
        </button>
      </section>
    </main>
  );
}

export default LoginPage;
