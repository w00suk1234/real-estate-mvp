import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { getProfile, upsertProfile } from "../services/supabaseRepository";

const AuthContext = createContext(null);

function toAuthEmail(usernameOrEmail) {
  const value = String(usernameOrEmail || "").trim();
  if (value.includes("@")) return value;
  return `${value || "user"}@agentnote.local`;
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

  const hydrateSupabaseUser = async (sessionUser) => {
    if (!sessionUser) {
      setUser(null);
      return;
    }

    let profile = null;
    try {
      profile = await getProfile();
    } catch {
      profile = null;
    }
    setUser(normalizeUser(sessionUser, profile));
  };

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        if (isSupabaseConfigured) {
          const { data } = await supabase.auth.getSession();
          if (mounted) await hydrateSupabaseUser(data.session?.user || null);
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

    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await hydrateSupabaseUser(session?.user || null);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const login = async ({ username, password }) => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: toAuthEmail(username),
        password,
      });
      if (error) throw error;
      await hydrateSupabaseUser(data.user);
      return normalizeUser(data.user);
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

    if (isSupabaseConfigured) {
      const email = toAuthEmail(payload.email || payload.username);
      const { data, error } = await supabase.auth.signUp({
        email,
        password: payload.password,
        options: {
          data: {
            username: payload.username,
            office_name: payload.office_name,
            manager_name: payload.manager_name,
            phone: payload.phone,
            email,
            privacy_agreed: true,
            role: "user",
          },
        },
      });
      if (error) throw error;
      if (!data.session) {
        throw new Error("가입이 완료되었습니다. 이메일 인증이 켜져 있다면 인증 후 로그인해 주세요.");
      }
      await upsertProfile({
        username: payload.username,
        office_name: payload.office_name,
        manager_name: payload.manager_name,
        phone: payload.phone,
        email,
        privacy_agreed: true,
      });
      await hydrateSupabaseUser(data.user);
      return normalizeUser(data.user);
    }

    return apiFetch("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
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

