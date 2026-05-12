const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const AUTH_REMEMBER_LOGIN_KEY = "agentnote_auth_remember_login";
export const AUTH_LAST_ACTIVITY_KEY = "agentnote_auth_last_activity";
export const AUTH_INACTIVITY_TIMEOUT_MS = Number(import.meta.env.VITE_AUTH_INACTIVITY_TIMEOUT_MS || SEVEN_DAYS_MS);

const LEGACY_AUTH_USER_KEY = "auth_user";
const AGENTNOTE_AUTH_PREFIX = "agentnote_auth_";

function safeStorage(type) {
  if (typeof window === "undefined") return null;
  try {
    const storage = type === "session" ? window.sessionStorage : window.localStorage;
    const testKey = "__agentnote_storage_test__";
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return storage;
  } catch {
    return null;
  }
}

function getLocalStorage() {
  return safeStorage("local");
}

function getSessionStorage() {
  return safeStorage("session");
}

function getStorageValue(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setStorageValue(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }
}

function removeStorageValue(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Ignore storage cleanup failures so auth flow can continue.
  }
}

function isSupabaseAuthKey(key) {
  return (/^sb-.+-auth-token$/.test(key) || key.includes("supabase.auth.token"));
}

function isAgentNoteAuthKey(key) {
  return key === LEGACY_AUTH_USER_KEY || key.startsWith(AGENTNOTE_AUTH_PREFIX) || isSupabaseAuthKey(key);
}

function removeMatchingKeys(storage, predicate) {
  if (!storage) return;
  try {
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && predicate(key)) keys.push(key);
    }
    keys.forEach((key) => removeStorageValue(storage, key));
  } catch {
    // Best-effort cleanup only.
  }
}

export function getRememberLoginPreference() {
  const sessionValue = getStorageValue(getSessionStorage(), AUTH_REMEMBER_LOGIN_KEY);
  if (sessionValue === "false") return false;
  if (sessionValue === "true") return true;

  const localValue = getStorageValue(getLocalStorage(), AUTH_REMEMBER_LOGIN_KEY);
  if (localValue === "false") return false;
  if (localValue === "true") return true;

  return true;
}

function getPreferredStorage() {
  return getRememberLoginPreference() ? getLocalStorage() : getSessionStorage();
}

function getFallbackStorage() {
  return getRememberLoginPreference() ? getSessionStorage() : getLocalStorage();
}

export function getAuthStorageItem(key) {
  return getStorageValue(getPreferredStorage(), key) ?? getStorageValue(getFallbackStorage(), key);
}

export function setAuthStorageItem(key, value) {
  setStorageValue(getPreferredStorage(), key, value);
  removeStorageValue(getFallbackStorage(), key);
}

export function removeAuthStorageItem(key) {
  removeStorageValue(getLocalStorage(), key);
  removeStorageValue(getSessionStorage(), key);
}

export function prepareAuthSessionStorage(rememberLogin = true) {
  const local = getLocalStorage();
  const session = getSessionStorage();
  if (rememberLogin) {
    setStorageValue(local, AUTH_REMEMBER_LOGIN_KEY, "true");
    removeStorageValue(session, AUTH_REMEMBER_LOGIN_KEY);
    removeMatchingKeys(session, (key) => isSupabaseAuthKey(key) || key === LEGACY_AUTH_USER_KEY);
    return;
  }

  setStorageValue(session, AUTH_REMEMBER_LOGIN_KEY, "false");
  removeStorageValue(local, AUTH_REMEMBER_LOGIN_KEY);
  removeMatchingKeys(local, (key) => isSupabaseAuthKey(key) || key === LEGACY_AUTH_USER_KEY);
}

export function clearAgentNoteAuthStorage() {
  removeMatchingKeys(getLocalStorage(), isAgentNoteAuthKey);
  removeMatchingKeys(getSessionStorage(), isAgentNoteAuthKey);
}

export function touchAuthActivity() {
  setAuthStorageItem(AUTH_LAST_ACTIVITY_KEY, String(Date.now()));
}

export function getLastAuthActivity() {
  const value = Number(getAuthStorageItem(AUTH_LAST_ACTIVITY_KEY) || 0);
  return Number.isFinite(value) ? value : 0;
}

export function isAuthInactive(timeoutMs = AUTH_INACTIVITY_TIMEOUT_MS) {
  const lastActivity = getLastAuthActivity();
  return Boolean(lastActivity && Date.now() - lastActivity > timeoutMs);
}

export const supabaseAuthStorage = {
  getItem: getAuthStorageItem,
  setItem: setAuthStorageItem,
  removeItem: removeAuthStorageItem,
};
