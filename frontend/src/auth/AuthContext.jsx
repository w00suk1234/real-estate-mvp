import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  clearAuthSession,
  getAuthToken,
  getStoredUser,
  setAuthSession,
} from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getAuthToken());
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(true);

  const logout = () => {
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
    const checkSession = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const data = await apiFetch("/auth/me");
        setUser(data.user);
      } catch {
        logout();
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, [token]);

  const login = async ({ username, password }) => {
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

  const signup = async ({ username, password }) => {
    const data = await apiFetch("/auth/signup", {
      auth: false,
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    setAuthSession(data.access_token, data.user);
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(token && user),
      isAdmin: user?.role === "admin",
      login,
      signup,
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
