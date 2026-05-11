import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import {
  getProfile,
  getProfileByContact,
  getProfileByUsername,
  upsertProfile,
} from "../services/supabaseRepository";

const AuthContext = createContext(null);
const AUTH_EMAIL_MAP_KEY = "agentnote_auth_email_map";
const AUTH_TIMEOUT_MS = 12000;
const PROFILE_TIMEOUT_MS = 3500;
function toAuthEmail(usernameOrEmail) {
  const value = String(usernameOrEmail || "").trim();
  if (value.includes("@")) return value;
  return "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function readAuthEmailMap() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_EMAIL_MAP_KEY) || "{}");
  } catch {
    return {};
  }
}

function rememberAuthEmail(username, email) {
  const key = String(username || "").trim();
  if (!key || !email) return;
  localStorage.setItem(AUTH_EMAIL_MAP_KEY, JSON.stringify({ ...readAuthEmailMap(), [key]: email }));
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function getAuthErrorMessage(error) {
  const message = String(error?.message || "");
  if (/invalid login credentials/i.test(message)) {
    return "이메일 또는 비밀번호가 맞지 않습니다.";
  }
  if (/email not confirmed/i.test(message)) {
    return "이메일 인증이 완료되지 않았습니다. 가입한 이메일의 인증 메일을 확인해 주세요.";
  }
  if (/user already registered|already registered/i.test(message)) {
    return "이미 가입된 계정입니다. 로그인 탭에서 로그인해 주세요.";
  }
  if (/duplicate|unique|profiles_username|already exists/i.test(message)) {
    return "이미 가입된 이메일입니다. 로그인 탭에서 로그인해 주세요.";
  }
  if (/email rate limit exceeded/i.test(message)) {
    return "Supabase 이메일 발송 한도에 걸렸습니다. 잠시 후 다시 시도하거나 관리자에게 이메일 인증 설정을 확인해 달라고 요청해 주세요.";
  }
  if (/unable to validate email|invalid email|email address/i.test(message)) {
    return "올바른 이메일 주소를 입력해 주세요.";
  }
  if (/password/i.test(message)) {
    return "비밀번호는 8자 이상으로 입력해 주세요.";
  }
  if (/network|failed to fetch/i.test(message)) {
    return "네트워크 연결이 불안정합니다. 잠시 후 다시 시도해 주세요.";
  }
  if (/요청 처리 중 오류가 발생했습니다/i.test(message)) {
    return "요청이 실패했습니다. 아이디 중복이거나 인증 서버 설정 문제일 수 있습니다.";
  }
  return message || "로그인 처리 중 오류가 발생했습니다.";
}

function normalizeUser(sessionUser, profile = {}) {
  if (!sessionUser && !profile) return null;
  const meta = sessionUser?.user_metadata || {};
  return {
    id: sessionUser?.id || profile?.id,
    username: profile?.username || meta.username || sessionUser?.email || "",
    email: profile?.email || sessionUser?.email || meta.email || "",
    role: profile?.role || meta.role || "user",
    office_name: profile?.office_name || meta.office_name || "",
    manager_name: profile?.manager_name || meta.manager_name || "",
    phone: profile?.phone || meta.phone || "",
    privacy_agreed: Boolean(profile?.privacy_agreed ?? meta.privacy_agreed),
  };
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const hydrateSupabaseUser = async (sessionUser, options = {}) => {
    if (!sessionUser) {
      setUser(null);
      return;
    }

    setUser(normalizeUser(sessionUser));
    if (options.skipProfile) return;

    let profile = null;
    try {
      profile = await withTimeout(getProfile(), PROFILE_TIMEOUT_MS, "프로필 정보를 불러오는 데 시간이 오래 걸립니다.");
    } catch {
      profile = null;
    }
    if (profile) setUser(normalizeUser(sessionUser, profile));
  };

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        if (isSupabaseConfigured) {
          const { data } = await withTimeout(
            supabase.auth.getSession(),
            AUTH_TIMEOUT_MS,
            "로그인 세션 확인 시간이 초과되었습니다.",
          );
          if (mounted) {
            const sessionUser = data.session?.user || null;
            if (sessionUser) {
              setUser(normalizeUser(sessionUser));
              hydrateSupabaseUser(sessionUser);
            } else {
              setUser(null);
            }
          }
        } else {
          const saved = localStorage.getItem("auth_user");
          if (mounted) setUser(saved ? JSON.parse(saved) : null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    boot();

    if (!isSupabaseConfigured) return () => { mounted = false; };

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        hydrateSupabaseUser(session?.user || null);
      }, 0);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const login = async ({ username, password }) => {
    if (isSupabaseConfigured) {
      const value = String(username || "").trim();
      const profile = value.includes("@")
        ? null
        : await withTimeout(
            getProfileByUsername(value),
            PROFILE_TIMEOUT_MS,
            "아이디 조회 시간이 초과되었습니다.",
          ).catch(() => null);
      const rememberedEmail = readAuthEmailMap()[value];
      const candidates = unique([
        value.includes("@") ? value : "",
        rememberedEmail,
        profile?.email,
        toAuthEmail(value),
      ]);
      let lastError = null;

      for (const email of candidates) {
        const { data, error } = await withTimeout(
          supabase.auth.signInWithPassword({
            email,
            password,
          }),
          AUTH_TIMEOUT_MS,
          "로그인 요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
        );
        if (!error) {
          setUser(normalizeUser(data.user));
          hydrateSupabaseUser(data.user);
          rememberAuthEmail(value, email);
          return normalizeUser(data.user);
        }
        lastError = error;
      }

      throw new Error(getAuthErrorMessage(lastError));
    }

    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem("auth_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const signup = async (payload) => {
    if (!payload.privacy_agreed) {
      throw new Error("개인정보 수집 및 이용 동의가 필요합니다.");
    }
    const email = String(payload.email || payload.username || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("올바른 이메일 주소를 입력해 주세요.");
    }
    if (String(payload.password || "").trim().length < 8) {
      throw new Error("비밀번호는 8자 이상으로 입력해 주세요.");
    }

    if (isSupabaseConfigured) {
      const existingProfile = await withTimeout(
        getProfileByUsername(email),
        PROFILE_TIMEOUT_MS,
        "이메일 중복 확인 시간이 초과되었습니다.",
      ).catch(() => null);
      if (existingProfile?.username) {
        throw new Error("이미 가입된 이메일입니다. 로그인 탭에서 로그인해 주세요.");
      }
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password: payload.password,
          options: {
            emailRedirectTo: `${window.location.origin}/?page=login`,
            data: {
              username: email,
              office_name: payload.office_name,
              manager_name: payload.manager_name,
              phone: payload.phone,
              email,
              privacy_agreed: true,
              role: "user",
            },
          },
        }),
        AUTH_TIMEOUT_MS,
        "회원가입 요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
      );
      if (error) throw new Error(getAuthErrorMessage(error));
      if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
        throw new Error("이미 가입된 계정입니다. 로그인 탭에서 로그인해 주세요.");
      }
      if (!data.session) {
        rememberAuthEmail(email, email);
        return {
          needsEmailConfirmation: true,
          email,
          user: normalizeUser(data.user),
        };
      }
      setUser(normalizeUser(data.user));
      try {
        await withTimeout(
          upsertProfile({
            username: email,
            office_name: payload.office_name,
            manager_name: payload.manager_name,
            phone: payload.phone,
            email,
            privacy_agreed: true,
          }),
          PROFILE_TIMEOUT_MS,
          "프로필 저장 시간이 초과되었습니다.",
        );
      } catch (profileError) {
        console.error(profileError);
      }
      hydrateSupabaseUser(data.user);
      rememberAuthEmail(email, email);
      return normalizeUser(data.user);
    }

    return apiFetch("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  };

  const findUsername = async ({ email, phone }) => {
    if (!isSupabaseConfigured) {
      return apiFetch("/auth/find-username", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email, phone }),
      });
    }

    const profile = await withTimeout(
      getProfileByContact({ email, phone }),
      PROFILE_TIMEOUT_MS,
      "계정 조회 시간이 초과되었습니다.",
    );

    if (!profile?.username) {
      throw new Error("입력한 정보와 일치하는 계정을 찾지 못했습니다.");
    }

    return profile;
  };

  const requestPasswordReset = async ({ usernameOrEmail }) => {
    const value = String(usernameOrEmail || "").trim();
    if (!value) throw new Error("이메일을 입력해 주세요.");

    if (isSupabaseConfigured) {
      const profile = value.includes("@")
        ? null
        : await withTimeout(
            getProfileByUsername(value),
            PROFILE_TIMEOUT_MS,
            "아이디 조회 시간이 초과되었습니다.",
          ).catch(() => null);
      const email = value.includes("@") ? value : profile?.email || readAuthEmailMap()[value] || "";

      if (!email) {
        throw new Error("재설정 메일을 받을 이메일을 찾지 못했습니다. 가입 시 입력한 이메일로 다시 시도해 주세요.");
      }

      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/?page=login&reset=1`,
        }),
        AUTH_TIMEOUT_MS,
        "비밀번호 재설정 요청 시간이 초과되었습니다.",
      );
      if (error) throw new Error(getAuthErrorMessage(error));
      return { email };
    }

    return apiFetch("/auth/password-reset-request", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ username: value }),
    });
  };

  const updatePassword = async ({ password }) => {
    const nextPassword = String(password || "").trim();
    if (nextPassword.length < 8) {
      throw new Error("비밀번호는 8자 이상으로 입력해 주세요.");
    }

    if (!isSupabaseConfigured) {
      throw new Error("로컬 계정은 관리자에게 비밀번호 초기화를 요청해 주세요.");
    }

    const { data, error } = await withTimeout(
      supabase.auth.updateUser({ password: nextPassword }),
      AUTH_TIMEOUT_MS,
      "비밀번호 변경 요청 시간이 초과되었습니다.",
    );
    if (error) throw new Error(getAuthErrorMessage(error));
    if (data.user) {
      setUser(normalizeUser(data.user));
      hydrateSupabaseUser(data.user);
    }
    return data.user;
  };

  const updateProfile = async (payload) => {
    if (isSupabaseConfigured) {
      const profile = await upsertProfile(payload);
      const nextUser = { ...user, ...profile };
      setUser(nextUser);
      return nextUser;
    }

    if (!user) throw new Error("로그인이 필요합니다.");
    const nextUser = { ...user, ...payload };
    localStorage.setItem("auth_user", JSON.stringify(nextUser));
    setUser(nextUser);
    return nextUser;
  };

  const logout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem("auth_user");
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      signup,
      findUsername,
      requestPasswordReset,
      updatePassword,
      updateProfile,
      logout,
      isAuthenticated: Boolean(user),
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

export { AuthProvider, useAuth };

