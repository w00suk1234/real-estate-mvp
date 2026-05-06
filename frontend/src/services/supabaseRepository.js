import { buildPriceSummary } from "../utils/brochure";
import { isHttpImageUrl, resizeImageFile } from "../utils/imageCompression";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const BUCKET_NAME = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "property-images";

const STORAGE_KEYS = {
  customers: "agentnote_customers",
  schedules: "agentnote_schedules",
  settlements: "agentnote_settlements",
  profile: "agentnote_profile",
  brochures: "agentnote_brochures",
  properties: "agentnote_properties",
};

const isBrowser = typeof window !== "undefined";

function readLocal(key, fallback) {
  if (!isBrowser) return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  if (!isBrowser) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function createLocalId(prefix) {
  return prefix + "_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}

function assertSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }
}

async function getCurrentUserId() {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id || null;
}

function hasBrowserFile(value) {
  return typeof File !== "undefined" && value instanceof File;
}

function stripEmpty(row) {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined && value !== "")
  );
}

async function fetchRows(table, localKey) {
  if (!isSupabaseConfigured || !supabase) return readLocal(localKey, []);
  const userId = await getCurrentUserId();
  if (!userId) return readLocal(localKey, []);
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42P01") return readLocal(localKey, []);
    throw error;
  }
  return data || [];
}

async function upsertRow(table, localKey, row, prefix) {
  if (!isSupabaseConfigured || !supabase) {
    const rows = readLocal(localKey, []);
    const nextRow = { ...row, id: row.id || createLocalId(prefix), created_at: row.created_at || new Date().toISOString() };
    const nextRows = rows.some((item) => item.id === nextRow.id)
      ? rows.map((item) => (item.id === nextRow.id ? { ...item, ...nextRow } : item))
      : [nextRow, ...rows];
    writeLocal(localKey, nextRows);
    return nextRow;
  }

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("로그인이 필요합니다.");
  const payload = stripEmpty({ ...row, user_id: userId });
  const { data, error } = await supabase
    .from(table)
    .upsert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteRow(table, localKey, id) {
  if (!id) return;
  if (!isSupabaseConfigured || !supabase) {
    writeLocal(localKey, readLocal(localKey, []).filter((item) => item.id !== id));
    return;
  }
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("로그인이 필요합니다.");
  const { error } = await supabase.from(table).delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function getProfile() {
  if (!isSupabaseConfigured || !supabase) return readLocal(STORAGE_KEYS.profile, null);
  const userId = await getCurrentUserId();
  if (!userId) return readLocal(STORAGE_KEYS.profile, null);
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    if (error.code === "42P01") return readLocal(STORAGE_KEYS.profile, null);
    throw error;
  }
  return data;
}

export async function upsertProfile(profile) {
  if (!isSupabaseConfigured || !supabase) {
    writeLocal(STORAGE_KEYS.profile, profile);
    return profile;
  }
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("로그인이 필요합니다.");
  const { data, error } = await supabase
    .from("profiles")
    .upsert(stripEmpty({ ...profile, id: userId }))
    .select()
    .single();
  if (error) throw error;
  return data;
}


export async function getProfileByUsername(username) {
  const value = String(username || "").trim();
  if (!value) return null;

  if (!isSupabaseConfigured || !supabase) {
    const profile = readLocal(STORAGE_KEYS.profile, null);
    return profile?.username === value ? profile : null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", value)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") return null;
    throw error;
  }
  return data || null;
}

export async function getProfileByContact({ email, phone } = {}) {
  const cleanEmail = String(email || "").trim();
  const cleanPhone = String(phone || "").trim();
  if (!cleanEmail && !cleanPhone) return null;

  if (!isSupabaseConfigured || !supabase) {
    const profile = readLocal(STORAGE_KEYS.profile, null);
    const matchesEmail = cleanEmail && profile?.email === cleanEmail;
    const matchesPhone = cleanPhone && profile?.phone === cleanPhone;
    return matchesEmail || matchesPhone ? profile : null;
  }

  if (cleanEmail) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01") return null;
      throw error;
    }
    if (data) return data;
  }

  if (cleanPhone) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("phone", cleanPhone)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01") return null;
      throw error;
    }
    if (data) return data;
  }

  return null;
}

export function listProperties() {
  return fetchRows("properties", STORAGE_KEYS.properties);
}

export function listCustomers() {
  return fetchRows("customers", STORAGE_KEYS.customers);
}

export function saveCustomer(customer) {
  return upsertRow("customers", STORAGE_KEYS.customers, customer, "customer");
}

export function deleteCustomer(id) {
  return deleteRow("customers", STORAGE_KEYS.customers, id);
}

export function listSchedules() {
  return fetchRows("schedules", STORAGE_KEYS.schedules);
}

export function saveSchedule(schedule) {
  return upsertRow("schedules", STORAGE_KEYS.schedules, schedule, "schedule");
}

export function deleteSchedule(id) {
  return deleteRow("schedules", STORAGE_KEYS.schedules, id);
}

export function listSettlements() {
  return fetchRows("settlements", STORAGE_KEYS.settlements);
}

export async function saveSettlement(settlement) {
  if (!isSupabaseConfigured || !supabase) {
    return upsertRow("settlements", STORAGE_KEYS.settlements, settlement, "settlement");
  }

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("로그인이 필요합니다.");
  const payload = stripEmpty({ ...settlement, user_id: userId });
  let query = supabase.from("settlements");
  let response;
  if (payload.source_schedule_id) {
    response = await query.upsert(payload, { onConflict: "source_schedule_id" }).select().single();
  } else {
    response = await query.upsert(payload).select().single();
  }
  if (response.error) throw response.error;
  return response.data;
}

export function deleteSettlement(id) {
  return deleteRow("settlements", STORAGE_KEYS.settlements, id);
}

export async function listBrochures() {
  if (!isSupabaseConfigured || !supabase) return readLocal(STORAGE_KEYS.brochures, []);
  const userId = await getCurrentUserId();
  if (!userId) return readLocal(STORAGE_KEYS.brochures, []);
  const { data, error } = await supabase
    .from("brochures")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42P01") return readLocal(STORAGE_KEYS.brochures, []);
    throw error;
  }
  return data || [];
}

export async function deleteBrochure(id) {
  return deleteRow("brochures", STORAGE_KEYS.brochures, id);
}

async function uploadOneImage(file, userId, folder) {
  if (!hasBrowserFile(file)) return file;
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("이미지는 1장당 10MB 이하만 업로드할 수 있습니다.");
  }
  const resized = await resizeImageFile(file);
  const date = new Date();
  const ymd = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  const ext = resized.type === "image/jpeg" ? "jpg" : "webp";
  const random = Math.random().toString(16).slice(2, 8);
  const storagePath = userId + "/" + ymd + "/" + folder + "/" + Date.now() + "_" + random + "." + ext;
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(storagePath, resized, {
    contentType: resized.type,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
  return data.publicUrl;
}

async function normalizeImages(images, userId, folder) {
  const items = Array.isArray(images) ? images : [];
  const uploaded = [];
  for (const item of items) {
    if (hasBrowserFile(item)) {
      uploaded.push(await uploadOneImage(item, userId, folder));
    } else if (isHttpImageUrl(item)) {
      uploaded.push(item);
    }
  }
  return uploaded;
}

export async function savePropertyAndBrochure(form, draft) {
  if (!isSupabaseConfigured || !supabase) {
    const localBrochures = readLocal(STORAGE_KEYS.brochures, []);
    const local = {
      id: createLocalId("brochure"),
      title: form.propertyName || "이름 없는 소개서",
      price_summary: buildPriceSummary(form),
      address: form.address || "",
      payload: { form, draft },
      created_at: new Date().toISOString(),
    };
    writeLocal(STORAGE_KEYS.brochures, [local, ...localBrochures]);
    return local;
  }

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("로그인 후 소개서를 저장할 수 있습니다.");

  const mainImages = await normalizeImages(form.mainPhoto ? [form.mainPhoto] : [], userId, "main");
  const extraImages = await normalizeImages(form.extraPhotos || [], userId, "extra");
  const imageUrls = [...mainImages, ...extraImages];

  const propertyPayload = {
    user_id: userId,
    title: form.propertyName || "이름 없는 매물",
    address: form.address || "",
    property_type: form.dealType || "",
    price_summary: buildPriceSummary(form),
    image_urls: imageUrls,
    payload: { ...form, mainPhoto: mainImages[0] || "", extraPhotos: extraImages },
  };

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .insert(propertyPayload)
    .select()
    .single();
  if (propertyError) throw propertyError;

  const brochurePayload = {
    user_id: userId,
    property_id: property.id,
    title: form.propertyName || "이름 없는 소개서",
    address: form.address || "",
    price_summary: buildPriceSummary(form),
    image_urls: imageUrls,
    payload: {
      form: { ...form, mainPhoto: mainImages[0] || "", extraPhotos: extraImages },
      draft,
    },
  };

  const { data: brochure, error: brochureError } = await supabase
    .from("brochures")
    .insert(brochurePayload)
    .select()
    .single();
  if (brochureError) throw brochureError;
  return brochure;
}
