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

  const updateLoginField = (key, value) => {
    setLoginForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateSignupField = (key, value) => {
    setSignupForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
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
  };

  return (
    <main className="auth-page">
      <section className="auth-card auth-card-wide">
        <p className="auth-eyebrow">REAL ESTATE WORK APP</p>
        <h1>{isSignup ? "회원가입" : "로그인"}</h1>
        <p className="auth-copy">
          일정, 고객, 소개서를 한 번에 관리할 수 있도록 로그인 정보를 먼저 설정해 주세요.
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
                    placeholder="예: 역삼 베스트 공인중개사"
                  />
                </label>

                <label>
                  담당자명
                  <input
                    value={signupForm.manager_name}
                    onChange={(event) => updateSignupField("manager_name", event.target.value)}
                    placeholder="예: 김도윤 실장"
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
                />
                <span>개인정보 수집 및 이용에 동의합니다.</span>
              </label>
            </>
          ) : null}

          {error ? <div className="auth-error">{error}</div> : null}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "처리 중..." : isSignup ? "가입하고 시작하기" : "로그인"}
          </button>
        </form>

        <button className="auth-skip" type="button" onClick={() => setPage?.("calculators")}>
          로그인 없이 계산기 먼저 둘러보기
        </button>
      </section>
    </main>
  );
}

export default LoginPage;
