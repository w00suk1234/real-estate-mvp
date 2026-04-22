const isViteDev =
  window.location.hostname === "127.0.0.1" &&
  window.location.port === "5173";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || (isViteDev ? "http://127.0.0.1:8000" : "");

const TOKEN_KEY = "real_estate_mvp_token";
const USER_KEY = "real_estate_mvp_user";

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function apiFetch(path, options = {}) {
  const { auth = true, headers: givenHeaders, ...fetchOptions } = options;
  const headers = new Headers(givenHeaders || {});
  const token = getAuthToken();

  if (auth && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (
    fetchOptions.body &&
    !(fetchOptions.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (response.status === 401) {
    clearAuthSession();
    window.dispatchEvent(new Event("auth:unauthorized"));
  }

  if (!response.ok) {
    const message =
      typeof data === "object" ? data.detail || data.message : data;
    throw new Error(message || "요청 처리 중 오류가 발생했습니다.");
  }

  return data;
}
