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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^01[016789]-\d{3,4}-\d{4}$/;
const PENDING_TEAM_INVITE_TOKEN_KEY = "agentnote_pending_team_invite_token";
const PENDING_TEAM_INVITE_STORED_AT_KEY = "agentnote_pending_team_invite_token_stored_at";
const PENDING_TEAM_INVITE_TTL_MS = 30 * 60 * 1000;

function extractTeamInviteToken(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";
  try {
    const parsed = new URL(rawValue);
    return parsed.searchParams.get("token") || rawValue;
  } catch {
    return rawValue;
  }
}

function getPendingTeamInviteToken() {
  const params = new URLSearchParams(window.location.search);
  return extractTeamInviteToken(params.get("token")) || getStoredTeamInviteToken();
}

function clearPendingTeamInviteToken() {
  sessionStorage.removeItem(PENDING_TEAM_INVITE_TOKEN_KEY);
  sessionStorage.removeItem(PENDING_TEAM_INVITE_STORED_AT_KEY);
}

function getStoredTeamInviteToken() {
  const token = extractTeamInviteToken(sessionStorage.getItem(PENDING_TEAM_INVITE_TOKEN_KEY));
  if (!token) return "";
  const storedAt = Number(sessionStorage.getItem(PENDING_TEAM_INVITE_STORED_AT_KEY) || 0);
  if (!storedAt || Date.now() - storedAt > PENDING_TEAM_INVITE_TTL_MS) {
    clearPendingTeamInviteToken();
    return "";
  }
  return token;
}

function preserveTeamInviteToken() {
  const token = getPendingTeamInviteToken();
  if (token) {
    sessionStorage.setItem(PENDING_TEAM_INVITE_TOKEN_KEY, token);
    sessionStorage.setItem(PENDING_TEAM_INVITE_STORED_AT_KEY, String(Date.now()));
  }
  return token;
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;

  const middleEnd = digits.length === 10 ? 6 : 7;
  return `${digits.slice(0, 3)}-${digits.slice(3, middleEnd)}-${digits.slice(middleEnd)}`;
}

function getPhoneError(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "연락처를 입력해 주세요.";
  if (!/^01[016789]\d{7,8}$/.test(digits)) {
    return "연락처 형식을 확인해 주세요. 예: 010-1234-5678";
  }
  return "";
}

function getLookupUsernameError(value) {
  const username = String(value || "").trim();
  if (!username) return "이메일을 입력해 주세요.";
  if (!EMAIL_PATTERN.test(username)) return "올바른 이메일 주소를 입력해 주세요.";
  return "";
}

function validateSignupForm(form) {
  const errors = {};
  const username = form.username.trim();
  const password = form.password || "";
  const phone = form.phone.trim();

  if (!username) {
    errors.username = "이메일을 입력해 주세요.";
  } else if (!EMAIL_PATTERN.test(username)) {
    errors.username = "올바른 이메일 주소를 입력해 주세요.";
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

  const phoneError = getPhoneError(phone);
  if (phoneError) errors.phone = phoneError;

  if (!form.privacy_agreed) {
    errors.privacy_agreed = "개인정보 수집 및 이용에 동의해야 가입할 수 있습니다.";
  }

  return errors;
}

function LoginPage({ setPage }) {
  const { login, logout, signup, findUsername, requestPasswordReset, updatePassword } = useAuth();
  const [mode, setMode] = useState("login");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [rememberLogin, setRememberLogin] = useState(true);
  const [signupForm, setSignupForm] = useState(initialSignupForm);
  const [signupTouched, setSignupTouched] = useState({});
  const [findTouched, setFindTouched] = useState({});
  const [resetTouched, setResetTouched] = useState({});
  const [findForm, setFindForm] = useState({ email: "", phone: "" });
  const [resetForm, setResetForm] = useState({ usernameOrEmail: "", phone: "" });
  const [newPasswordForm, setNewPasswordForm] = useState({ password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [authNotice, setAuthNotice] = useState(null);

  const isSignup = mode === "signup";
  const isFindId = mode === "find-id";
  const isResetRequest = mode === "reset-request";
  const isResetPassword = mode === "reset-password";
  const isAccountRecovery = isFindId || isResetRequest;
  const signupErrors = useMemo(() => validateSignupForm(signupForm), [signupForm]);
  const findPhoneError = useMemo(() => getPhoneError(findForm.phone), [findForm.phone]);
  const resetUsernameError = useMemo(() => getLookupUsernameError(resetForm.usernameOrEmail), [resetForm.usernameOrEmail]);
  const resetPhoneError = useMemo(() => getPhoneError(resetForm.phone), [resetForm.phone]);
  const hasSignupErrors = Object.keys(signupErrors).length > 0;
  const isSubmitDisabled =
    loading ||
    (isSignup && hasSignupErrors) ||
    (isFindId && Boolean(findPhoneError)) ||
    (isResetRequest && Boolean(resetUsernameError || resetPhoneError));

  useEffect(() => {
    preserveTeamInviteToken();

    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
    const authType = hashParams.get("type");

    if (authType === "signup" || authType === "email_confirmation") {
      setMode("login");
      setError("");
      setResult("");
      setAuthNotice({
        title: "이메일 인증이 완료되었습니다.",
        body: "회원가입이 정상 처리되었습니다. 보안을 위해 다시 로그인해 주세요.",
      });
      logout?.().catch((err) => console.error(err));
      window.history.replaceState({}, "", `${window.location.pathname}?page=login`);
      return;
    }

    if (params.get("reset") === "1" || window.location.hash.includes("type=recovery")) {
      setMode("reset-password");
    }
  }, [logout]);

  function goAfterAuth(defaultPage = "schedules") {
    const teamInviteToken = preserveTeamInviteToken();
    if (teamInviteToken) {
      window.history.replaceState({}, "", `/team?token=${encodeURIComponent(teamInviteToken)}`);
      setPage?.("team-mode");
      return;
    }
    setPage?.(defaultPage);
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setResult("");
    setAuthNotice(null);
    setSignupTouched({});
    setFindTouched({});
    setResetTouched({});
  }

  function updateLoginField(key, value) {
    setLoginForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateSignupField(key, value) {
    const nextValue = key === "phone" ? formatPhone(value) : value;
    setSignupForm((prev) => ({
      ...prev,
      [key]: nextValue,
      ...(key === "username" ? { email: nextValue } : {}),
    }));
    setSignupTouched((prev) => ({ ...prev, [key]: true }));
  }

  function updateFindField(key, value) {
    const nextValue = key === "phone" ? formatPhone(value) : value;
    setFindForm((prev) => ({ ...prev, [key]: nextValue }));
    setFindTouched((prev) => ({ ...prev, [key]: true }));
  }

  function updateResetField(key, value) {
    const nextValue = key === "phone" ? formatPhone(value) : value;
    setResetForm((prev) => ({ ...prev, [key]: nextValue }));
    setResetTouched((prev) => ({ ...prev, [key]: true }));
  }

  function showSignupError(key) {
    return isSignup && signupTouched[key] ? signupErrors[key] : "";
  }

  function showFindError(key) {
    if (!isFindId || !findTouched[key]) return "";
    return key === "phone" ? findPhoneError : "";
  }

  function showResetError(key) {
    if (!isResetRequest || !resetTouched[key]) return "";
    if (key === "usernameOrEmail") return resetUsernameError;
    if (key === "phone") return resetPhoneError;
    return "";
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
        const signupResult = await signup(signupForm);
        if (signupResult?.needsEmailConfirmation) {
          setAuthNotice({
            title: "회원가입 신청이 완료되었습니다.",
            body: `${signupResult.email}로 인증 메일을 보냈습니다. 메일의 인증 링크를 누른 뒤 다시 로그인해 주세요.`,
          });
          setLoginForm((prev) => ({ ...prev, username: signupResult.email }));
          setMode("login");
          return;
        }
        goAfterAuth("schedules");
        return;
      }

      if (isFindId) {
        const phoneError = getPhoneError(findForm.phone);
        if (phoneError) {
          setFindTouched({ phone: true });
          throw new Error("입력값을 다시 확인해 주세요.");
        }
        const profile = await findUsername(findForm);
        setResult(`가입된 아이디는 ${profile.username} 입니다.`);
        return;
      }

      if (isResetRequest) {
        const usernameError = getLookupUsernameError(resetForm.usernameOrEmail);
        const phoneError = getPhoneError(resetForm.phone);
        if (usernameError || phoneError) {
          setResetTouched({ usernameOrEmail: true, phone: true });
          throw new Error("입력값을 다시 확인해 주세요.");
        }

        const profile = await findUsername({ phone: resetForm.phone });
        const lookupValue = resetForm.usernameOrEmail.trim().toLowerCase();
        const profileIds = [profile.username, profile.email]
          .filter(Boolean)
          .map((value) => String(value).trim().toLowerCase());
        if (!profileIds.includes(lookupValue)) {
          throw new Error("이메일 또는 연락처가 일치하지 않습니다.");
        }

        try {
          const response = await requestPasswordReset(resetForm);
          setResult(
            response?.email
              ? `${response.email} 주소로 비밀번호 재설정 메일을 보냈습니다.`
              : "계정 확인이 완료되었습니다. 관리자에게 비밀번호 초기화를 요청해 주세요.",
          );
        } catch (resetError) {
          const resetMessage = resetError.message || "";
          if (/이메일을 찾지 못했습니다|agentnote\.local|재설정 메일/i.test(resetMessage)) {
            setResult("계정 확인이 완료되었습니다. 현재 계정은 이메일 없이 생성되어 관리자에게 비밀번호 초기화를 요청해 주세요.");
            return;
          }
          throw resetError;
        }
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

      await login({ ...loginForm, rememberLogin });
      goAfterAuth("schedules");
    } catch (err) {
      const message = err.message || "처리 중 오류가 발생했습니다.";
      setError(isSignup && /요청 처리 중 오류가 발생했습니다/.test(message)
        ? "회원가입에 실패했습니다. 이미 가입된 이메일이거나 인증 서버 설정 문제일 수 있습니다."
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
    if (isFindId) return "가입할 때 입력한 연락처로 이메일 아이디를 확인합니다.";
    if (isResetRequest) return "이메일과 연락처를 확인한 뒤 비밀번호 재설정 방법을 안내합니다.";
    if (isResetPassword) return "메일 링크 인증이 끝난 계정의 비밀번호를 새로 설정합니다.";
    return "계정으로 로그인하고 고객, 일정, 소개서 데이터를 관리하세요.";
  }

  function getSubmitText() {
    if (loading) {
      if (isSignup) return "가입 중...";
      if (isFindId) return "아이디 확인 중...";
      if (isResetRequest) return "계정 확인 중...";
      return "처리 중...";
    }
    if (isSignup) return "가입하기";
    if (isFindId) return "아이디 확인";
    if (isResetRequest) return "비밀번호 재설정 확인";
    if (isResetPassword) return "비밀번호 변경";
    return "로그인";
  }

  return (
    <main className="auth-page">
      <section className="auth-card auth-card-wide">
        <p className="auth-eyebrow">부동산 업무 통합툴</p>
        <h1>{getTitle()}</h1>
        <p className="auth-copy">{getCopy()}</p>

        {authNotice ? (
          <div className="auth-notice" role="status" aria-live="polite">
            <strong>{authNotice.title}</strong>
            <p>{authNotice.body}</p>
            <button type="button" onClick={() => switchMode("login")}>
              로그인하기
            </button>
          </div>
        ) : null}

        {!isAccountRecovery && !isResetPassword ? (
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
        ) : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          {isFindId ? (
            <div className="auth-grid one">
              <label>
                연락처
                <input
                  className={showFindError("phone") ? "is-invalid" : ""}
                  value={findForm.phone}
                  onChange={(event) => updateFindField("phone", event.target.value)}
                  inputMode="numeric"
                  placeholder="숫자만 입력: 01012345678"
                />
                <span className="field-helper">숫자만 입력해 주세요. 하이픈은 자동으로 붙습니다.</span>
                {showFindError("phone") ? <span className="field-error">{showFindError("phone")}</span> : null}
              </label>
            </div>
          ) : null}

          {isResetRequest ? (
            <div className="auth-grid one">
              <label>
                이메일
                <input
                  className={showResetError("usernameOrEmail") ? "is-invalid" : ""}
                  value={resetForm.usernameOrEmail}
                  onChange={(event) => updateResetField("usernameOrEmail", event.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                  placeholder="예: broker@example.com"
                />
                {showResetError("usernameOrEmail") ? (
                  <span className="field-error">{showResetError("usernameOrEmail")}</span>
                ) : null}
              </label>

              <label>
                연락처
                <input
                  className={showResetError("phone") ? "is-invalid" : ""}
                  value={resetForm.phone}
                  onChange={(event) => updateResetField("phone", event.target.value)}
                  inputMode="numeric"
                  placeholder="숫자만 입력: 01012345678"
                />
                <span className="field-helper">숫자만 입력해 주세요. 가입할 때 입력한 연락처와 비교합니다.</span>
                {showResetError("phone") ? <span className="field-error">{showResetError("phone")}</span> : null}
              </label>
            </div>
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
                이메일
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
                  placeholder="예: broker@example.com"
                />
                {isSignup ? <span className="field-helper">로그인 아이디로 사용할 이메일 주소를 입력해 주세요.</span> : null}
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

              {!isSignup ? (
                <label className="auth-checkbox auth-remember-row">
                  <input
                    type="checkbox"
                    checked={rememberLogin}
                    onChange={(event) => setRememberLogin(event.target.checked)}
                  />
                  <span>
                    <strong>로그인 상태 유지</strong>
                    <small>공용 PC에서는 체크를 해제해 주세요.</small>
                  </span>
                </label>
              ) : null}

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
                  inputMode="numeric"
                  placeholder="숫자만 입력: 01012345678"
                />
                <span className="field-helper">숫자만 입력해 주세요. 하이픈은 자동으로 붙습니다.</span>
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
            {getSubmitText()}
          </button>
        </form>

        {isAccountRecovery || isResetPassword ? (
          <>
            <div className="auth-helper-actions auth-helper-actions-separated">
              <button
                type="button"
                className={isFindId ? "active" : ""}
                onClick={() => switchMode("find-id")}
              >
                아이디 찾기
              </button>
              <button
                type="button"
                className={isResetRequest ? "active" : ""}
                onClick={() => switchMode("reset-request")}
              >
                비밀번호 찾기
              </button>
            </div>
            <button className="auth-secondary-full" type="button" onClick={() => switchMode("login")}>
              로그인으로 돌아가기
            </button>
          </>
        ) : (
          <div className="auth-helper-actions">
            <button type="button" onClick={() => switchMode("find-id")}>
              아이디 찾기
            </button>
            <button type="button" onClick={() => switchMode("reset-request")}>
              비밀번호 찾기
            </button>
          </div>
        )}

        <button className="auth-skip" type="button" onClick={() => setPage?.("calculators")}>
          로그인 없이 계산기 먼저 보기
        </button>
      </section>
    </main>
  );
}

export default LoginPage;
