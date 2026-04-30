import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  clearAuthSession,
  getAuthToken,
  getStoredUser,
  setAuthSession,
} from "../api";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const AuthContext = createContext(null);

function toAuthEmail(identifier = "") {
  const value = identifier.trim();
  if (!value) return "";
  return value.includes("@") ? value : `${value}@real-estate.local`;
}

function profileFromUser(authUser, profile = {}) {
  const metadata = authUser?.user_metadata || {};
  return {
    id: authUser?.id,
    username: profile.username || metadata.username || authUser?.email?.split("@")[0] || "",
    role: profile.role || metadata.role || "user",
    office_name: profile.office_name || metadata.office_name || "",
    manager_name: profile.manager_name || metadata.manager_name || "",
    phone: profile.phone || metadata.phone || "",
    email: profile.email || metadata.contact_email || authUser?.email || "",
    privacy_agreed: Boolean(profile.privacy_agreed ?? metadata.privacy_agreed),
  };
}

async function fetchSupabaseProfile(authUser) {
  if (!supabase || !authUser?.id) return profileFromUser(authUser);

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error) {
    console.warn(error);
    return profileFromUser(authUser);
  }

  return profileFromUser(authUser, data || {});
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getAuthToken());
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(true);

  const logout = async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    clearAuthSession();
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    const handleUnauthorized = () => logout();
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      let mounted = true;

      supabase.auth.getSession().then(async ({ data }) => {
        if (!mounted) return;
        const session = data?.session;
        if (!session?.user) {
          clearAuthSession();
          setToken(null);
          setUser(null);
          setLoading(false);
          return;
        }

        const profile = await fetchSupabaseProfile(session.user);
        setAuthSession(session.access_token, profile);
        setToken(session.access_token);
        setUser(profile);
        setLoading(false);
      });

      const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (!mounted) return;
        if (!session?.user) {
          clearAuthSession();
          setToken(null);
          setUser(null);
          setLoading(false);
          return;
        }

        const profile = await fetchSupabaseProfile(session.user);
        setAuthSession(session.access_token, profile);
        setToken(session.access_token);
        setUser(profile);
        setLoading(false);
      });

      return () => {
        mounted = false;
        subscription?.subscription?.unsubscribe();
      };
    }

    const checkLegacySession = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const data = await apiFetch("/auth/me");
        setUser(data.user);
      } catch {
        await logout();
      } finally {
        setLoading(false);
      }
    };

    checkLegacySession();
  }, []);

  const login = async ({ username, password }) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: toAuthEmail(username),
        password,
      });

      if (error) throw error;
      const profile = await fetchSupabaseProfile(data.user);
      setAuthSession(data.session.access_token, profile);
      setToken(data.session.access_token);
      setUser(profile);
      return profile;
    }

    const data = await apiFetch("/auth/login", {
      auth: false,
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    setAuthSession(data.access_token, data.user);
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const signup = async (payload) => {
    if (!payload.privacy_agreed) {
      throw new Error("개인정보 수집 및 이용 동의가 필요합니다.");
    }

    if (isSupabaseConfigured && supabase) {
      const email = toAuthEmail(payload.email || payload.username);
      const metadata = {
        username: payload.username,
        office_name: payload.office_name,
        manager_name: payload.manager_name,
        phone: payload.phone,
        contact_email: payload.email,
        privacy_agreed: payload.privacy_agreed,
        role: "user",
      };

      const { data, error } = await supabase.auth.signUp({
        email,
        password: payload.password,
        options: { data: metadata },
      });

      if (error) throw error;
      if (!data.session) {
        throw new Error("가입은 완료되었습니다. 이메일 인증이 켜져 있다면 인증 후 로그인해 주세요.");
      }

      const profile = await fetchSupabaseProfile(data.user);
      setAuthSession(data.session.access_token, profile);
      setToken(data.session.access_token);
      setUser(profile);
      return profile;
    }

    const data = await apiFetch("/auth/signup", {
      auth: false,
      method: "POST",
      body: JSON.stringify(payload),
    });

    setAuthSession(data.access_token, data.user);
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const updateProfile = async (payload) => {
    if (isSupabaseConfigured && supabase) {
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData?.user;
      if (!authUser) throw new Error("로그인이 필요합니다.");

      const nextProfile = {
        id: authUser.id,
        username: user?.username || authUser.email?.split("@")[0] || "",
        role: user?.role || "user",
        office_name: payload.office_name || "",
        manager_name: payload.manager_name || "",
        phone: payload.phone || "",
        email: payload.email || authUser.email || "",
        privacy_agreed: user?.privacy_agreed ?? true,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("profiles")
        .upsert(nextProfile)
        .select()
        .single();

      if (error) throw error;
      const normalized = profileFromUser(authUser, data);
      setAuthSession(token || "", normalized);
      setUser(normalized);
      return normalized;
    }

    const data = await apiFetch("/auth/me", {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    setAuthSession(token, data.user);
    setUser(data.user);
    return data.user;
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === "admin",
      login,
      signup,
      updateProfile,
      logout,
    }),
    [user, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
