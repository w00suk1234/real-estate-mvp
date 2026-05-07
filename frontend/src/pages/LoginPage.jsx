import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import "../styles/auth.css";

const initialSignupForm = {
  username: "",
  password: "",
  password_confirm: "",
  office_name: "",
  manager_name: "",
  phone: "",
  email: "",
  privacy_agreed: false,
};

const SIGNUP_FIELD_KEYS = [
  "username",
  "password",
  "password_confirm",
  "office_name",
  "manager_name",
  "phone",
  "privacy_agreed",
];

const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const PHONE_PATTERN = /^01[016789]-\d{3,4}-\d{4}$/;

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;

  const middleEnd = digits.length === 10 ? 6 : 7;
  return `${digits.slice(0, 3)}-${digits.slice(3, middleEnd)}-${digits.slice(middleEnd)}`;
}

function validateSignupForm(form) {
  const errors = {};
  const username = form.username.trim();
  const password = form.password || "";
  const phone = form.phone.trim();

  if (!username) {
    errors.username = "아이디를 입력해 주세요.";
  } else if (username.length < 4) {
    errors.username = "아이디는 4자 이상 입력해 주세요.";
  } else if (username.length > 20) {
    errors.username = "아이디는 20자 이하로 입력해 주세요.";
  } else if (!USERNAME_PATTERN.test(username)) {
    errors.username = "아이디는 영문, 숫자, -, _만 입력해 주세요.";
  }

  if (!password) {
    errors.password = "비밀번호를 입력해 주세요.";
  } else if (password.length < 8) {
    errors.password = "비밀번호는 8자 이상 입력해 주세요.";
  } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = "영문과 숫자를 함께 사용해 주세요.";
  }

  if (!form.password_confirm) {
    errors.password_confirm = "비밀번호 확인을 입력해 주세요.";
  } else if (password && form.password_confirm !== password) {
    errors.password_confirm = "비밀번호가 일치하지 않습니다.";
  }

  if (!form.office_name.trim()) {
    errors.office_name = "부동산 이름을 입력해 주세요.";
  }

  if (!form.manager_name.trim()) {
    errors.manager_name = "담당자명을 입력해 주세요.";
  }

  if (!phone) {
    errors.phone = "연락처를 입력해 주세요.";
  } else if (!PHONE_PATTERN.test(phone)) {
    errors.phone = "연락처 형식을 확인해 주세요. 예: 010-1234-5678";
  }

  if (!form.privacy_agreed) {
    errors.privacy_agreed = "개인정보 수집 및 이용에 동의해야 가입할 수 있습니다.";
  }

  return errors;
}

function LoginPage({ setPage }) {
  const { login, signup, findUsername, requestPasswordReset, updatePassword } = useAuth();
  const [mode, setMode] = useState("login");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [signupForm, setSignupForm] = useState(initialSignupForm);
  const [signupTouched, setSignupTouched] = useState({});
  const [findForm, setFindForm] = useState({ email: "", phone: "" });
  const [resetForm, setResetForm] = useState({ usernameOrEmail: "" });
  const [newPasswordForm, setNewPasswordForm] = useState({ password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const isSignup = mode === "signup";
  const isFindId = mode === "find-id";
  const isResetRequest = mode === "reset-request";
  const isResetPassword = mode === "reset-password";
  const signupErrors = useMemo(() => validateSignupForm(signupForm), [signupForm]);
  const hasSignupErrors = Object.keys(signupErrors).length > 0;
  const isSubmitDisabled = loading || (isSignup && hasSignupErrors);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "1" || window.location.hash.includes("type=recovery")) {
      setMode("reset-password");
    }
  }, []);

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setResult("");
    setSignupTouched({});
  }

  function updateLoginField(key, value) {
    setLoginForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateSignupField(key, value) {
    const nextValue = key === "phone" ? formatPhone(value) : value;
    setSignupForm((prev) => ({ ...prev, [key]: nextValue }));
    setSignupTouched((prev) => ({ ...prev, [key]: true }));
  }

  function showSignupError(key) {
    return isSignup && signupTouched[key] ? signupErrors[key] : "";
  }

  function markAllSignupFieldsTouched() {
    setSignupTouched(
      SIGNUP_FIELD_KEYS.reduce((acc, key) => {
        acc[key] = true;
        return acc;
      }, {}),
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setResult("");
    setLoading(true);

    try {
      if (isSignup) {
        const nextErrors = validateSignupForm(signupForm);
        if (Object.keys(nextErrors).length > 0) {
          markAllSignupFieldsTouched();
          throw new Error("입력값을 다시 확인해 주세요.");
        }
        await signup(signupForm);
        setPage?.("schedules");
        return;
      }

      if (isFindId) {
        if (!findForm.phone.trim()) {
          throw new Error("가입할 때 입력한 연락처를 입력해 주세요.");
        }
        const profile = await findUsername(findForm);
        setResult(`찾은 아이디: ${profile.username}`);
        return;
      }

      if (isResetRequest) {
        const response = await requestPasswordReset(resetForm);
        setResult(
          response?.email
            ? `${response.email} 주소로 비밀번호 재설정 메일을 보냈습니다.`
            : "비밀번호 재설정 요청을 접수했습니다.",
        );
        return;
      }

      if (isResetPassword) {
        if (newPasswordForm.password !== newPasswordForm.confirm) {
          throw new Error("새 비밀번호가 서로 일치하지 않습니다.");
        }
        await updatePassword({ password: newPasswordForm.password });
        setResult("새 비밀번호로 변경했습니다. 이제 로그인할 수 있습니다.");
        setNewPasswordForm({ password: "", confirm: "" });
        setMode("login");
        return;
      }

      await login(loginForm);
      setPage?.("schedules");
    } catch (err) {
      const message = err.message || "처리 중 오류가 발생했습니다.";
      setError(isSignup && /요청 처리 중 오류가 발생했습니다/.test(message)
        ? "회원가입에 실패했습니다. 아이디 중복 또는 인증 서버 설정 문제일 수 있습니다."
        : message);
    } finally {
      setLoading(false);
    }
  }

  function getTitle() {
    if (isSignup) return "회원가입";
    if (isFindId) return "아이디 찾기";
    if (isResetRequest) return "비밀번호 찾기";
    if (isResetPassword) return "새 비밀번호 설정";
    return "로그인";
  }

  function getCopy() {
    if (isSignup) return "기본 계정 정보를 입력하면 고객, 일정, 소개서 저장 기능을 사용할 수 있습니다.";
    if (isFindId) return "가입할 때 입력한 연락처로 아이디를 확인합니다.";
    if (isResetRequest) return "아이디를 입력하면 비밀번호 재설정 가능 여부를 확인합니다.";
    if (isResetPassword) return "메일 링크 인증이 끝난 계정의 비밀번호를 새로 설정합니다.";
    return "계정으로 로그인하고 고객, 일정, 소개서 데이터를 관리하세요.";
  }

  return (
    <main className="auth-page">
      <section className="auth-card auth-card-wide">
        <p className="auth-eyebrow">부동산 업무 통합툴</p>
        <h1>{getTitle()}</h1>
        <p className="auth-copy">{getCopy()}</p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => switchMode("login")}
          >
            로그인
          </button>
          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            onClick={() => switchMode("signup")}
          >
            회원가입
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isFindId ? (
            <div className="auth-grid one">
              <label>
                연락처
                <input
                  value={findForm.phone}
                  onChange={(event) => setFindForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="예: 010-1234-5678"
                />
              </label>
            </div>
          ) : null}

          {isResetRequest ? (
            <label>
              아이디
              <input
                value={resetForm.usernameOrEmail}
                onChange={(event) => setResetForm({ usernameOrEmail: event.target.value })}
                autoComplete="username"
                autoFocus
                required
                placeholder="예: broker01"
              />
            </label>
          ) : null}

          {isResetPassword ? (
            <div className="auth-grid two">
              <label>
                새 비밀번호
                <input
                  type="password"
                  value={newPasswordForm.password}
                  onChange={(event) => setNewPasswordForm((prev) => ({ ...prev, password: event.target.value }))}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  autoFocus
                  placeholder="8자 이상 입력"
                />
              </label>
              <label>
                새 비밀번호 확인
                <input
                  type="password"
                  value={newPasswordForm.confirm}
                  onChange={(event) => setNewPasswordForm((prev) => ({ ...prev, confirm: event.target.value }))}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="한 번 더 입력"
                />
              </label>
            </div>
          ) : null}

          {!isFindId && !isResetRequest && !isResetPassword ? (
            <>
              <label>
                아이디
                <input
                  className={showSignupError("username") ? "is-invalid" : ""}
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
                  placeholder="예: broker01"
                />
                {isSignup ? <span className="field-helper">영문, 숫자, -, _ 사용 가능</span> : null}
                {showSignupError("username") ? <span className="field-error">{showSignupError("username")}</span> : null}
              </label>

              <label>
                비밀번호
                <input
                  className={showSignupError("password") ? "is-invalid" : ""}
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
                {isSignup ? <span className="field-helper">8자 이상, 영문과 숫자를 포함해 주세요.</span> : null}
                {showSignupError("password") ? <span className="field-error">{showSignupError("password")}</span> : null}
              </label>

              {isSignup ? (
                <label>
                  비밀번호 확인
                  <input
                    className={showSignupError("password_confirm") ? "is-invalid" : ""}
                    type="password"
                    value={signupForm.password_confirm}
                    onChange={(event) => updateSignupField("password_confirm", event.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="한 번 더 입력"
                  />
                  {showSignupError("password_confirm") ? (
                    <span className="field-error">{showSignupError("password_confirm")}</span>
                  ) : null}
                </label>
              ) : null}
            </>
          ) : null}

          {isSignup ? (
            <>
              <div className="auth-grid two">
                <label>
                  부동산 이름
                  <input
                    className={showSignupError("office_name") ? "is-invalid" : ""}
                    value={signupForm.office_name}
                    onChange={(event) => updateSignupField("office_name", event.target.value)}
                    placeholder="예: 역삼 프라임 공인중개사"
                  />
                  {showSignupError("office_name") ? <span className="field-error">{showSignupError("office_name")}</span> : null}
                </label>

                <label>
                  담당자명
                  <input
                    className={showSignupError("manager_name") ? "is-invalid" : ""}
                    value={signupForm.manager_name}
                    onChange={(event) => updateSignupField("manager_name", event.target.value)}
                    placeholder="예: 김중개"
                  />
                  {showSignupError("manager_name") ? <span className="field-error">{showSignupError("manager_name")}</span> : null}
                </label>
              </div>

              <label>
                연락처
                <input
                  className={showSignupError("phone") ? "is-invalid" : ""}
                  value={signupForm.phone}
                  onChange={(event) => updateSignupField("phone", event.target.value)}
                  placeholder="예: 010-1234-5678"
                />
                <span className="field-helper">예: 010-1234-5678</span>
                {showSignupError("phone") ? <span className="field-error">{showSignupError("phone")}</span> : null}
              </label>

              <label className={`auth-consent-row ${showSignupError("privacy_agreed") ? "is-invalid" : ""}`}>
                <input
                  type="checkbox"
                  checked={signupForm.privacy_agreed}
                  onChange={(event) => updateSignupField("privacy_agreed", event.target.checked)}
                  required
                />
                <span>개인정보 수집 및 이용에 동의합니다.</span>
              </label>
              {showSignupError("privacy_agreed") ? (
                <p className="field-error auth-consent-error">{showSignupError("privacy_agreed")}</p>
              ) : null}
            </>
          ) : null}

          {error ? <div className="auth-error">{error}</div> : null}
          {result ? <div className="auth-success">{result}</div> : null}

          <button className="auth-submit" type="submit" disabled={isSubmitDisabled}>
            {loading
              ? isSignup
                ? "가입 중..."
                : "처리 중..."
              : isSignup
                ? "가입하기"
                : isFindId
                  ? "아이디 확인"
                  : isResetRequest
                    ? "재설정 메일 받기"
                    : isResetPassword
                      ? "비밀번호 변경"
                      : "로그인"}
          </button>
        </form>

        <div className="auth-helper-actions">
          <button type="button" onClick={() => switchMode("find-id")}>
            아이디 찾기
          </button>
          <button type="button" onClick={() => switchMode("reset-request")}>
            비밀번호 찾기
          </button>
        </div>

        <button className="auth-skip" type="button" onClick={() => setPage?.("calculators")}>
          로그인 없이 계산기 먼저 보기
        </button>
      </section>
    </main>
  );
}

export default LoginPage;
