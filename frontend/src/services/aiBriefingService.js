import { isSupabaseConfigured, supabase } from "../lib/supabase";

async function getAuthHeader() {
  if (!isSupabaseConfigured || !supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function requestJson(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(await getAuthHeader()),
    ...(options.headers || {}),
  };
  const response = await fetch(path, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "요청 처리 중 오류가 발생했습니다.");
  }
  return payload;
}

export async function generateAiBriefing({ customer, properties, criteria }) {
  return requestJson("/api/ai-briefing", {
    method: "POST",
    body: JSON.stringify({ customer, properties, criteria }),
  });
}

export async function listAiBriefings(customerId) {
  const query = customerId ? `?customerId=${encodeURIComponent(customerId)}` : "";
  return requestJson(`/api/ai-briefings${query}`);
}

export async function saveCustomerPropertyFeedback(payload) {
  return requestJson("/api/customer-property-feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
