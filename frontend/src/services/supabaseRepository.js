import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { buildPriceSummary as buildDisplayPriceSummary } from "../utils/brochure";
import { isHttpImageUrl, resizeImageFile } from "../utils/imageCompression";

const BUCKET_NAME = "property-images";
const STORAGE_KEYS = {
  customers: "real_estate_mvp_customers",
  schedules: "real_estate_mvp_schedules",
  brochures: "real_estate_mvp_brochures",
};

const CUSTOMER_FIELDS = [
  "name",
  "phone",
  "preferred_area",
  "property_type",
  "wanted_condition",
  "contract_status",
  "priority",
  "inflow_date",
  "memo",
];

const SCHEDULE_FIELDS = [
  "title",
  "customer_id",
  "customer_name",
  "schedule_date",
  "schedule_time",
  "schedule_type",
  "note",
];

function readLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function writeLocal(key, items) {
  localStorage.setItem(key, JSON.stringify(items));
}

function createLocalId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hasBrowserFile(value) {
  return (
    (typeof File !== "undefined" && value instanceof File) ||
    (typeof Blob !== "undefined" && value instanceof Blob)
  );
}

function stripEmpty(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

function pickFields(source, fields) {
  return Object.fromEntries(
    fields
      .filter((field) => Object.prototype.hasOwnProperty.call(source, field))
      .map((field) => [field, source[field]])
  );
}

async function writeCustomerWithFallback(query, customer, payload) {
  const variants = [
    payload,
    stripEmpty({
      name: customer.name,
      phone: customer.phone,
      preferred_area: customer.preferred_area,
      requirement: customer.wanted_condition,
      notes: customer.memo,
      inquiry_date: customer.inflow_date || null,
      contract_status: customer.contract_status,
      priority: customer.priority,
      user_id: payload.user_id,
    }),
    stripEmpty({
      name: customer.name,
      phone: customer.phone,
      contract_status: customer.contract_status,
      priority: customer.priority,
      user_id: payload.user_id,
    }),
  ];

  let lastError = null;
  for (const variant of variants) {
    const response = customer.id
      ? await query.update(variant).eq("id", customer.id).select().single()
      : await query.insert(variant).select().single();

    if (!response.error) return response.data;
    lastError = response.error;
  }

  throw lastError;
}

function buildScheduleFallbackNote(schedule) {
  return [
    schedule.schedule_type ? `종류: ${schedule.schedule_type}` : "",
    schedule.schedule_time ? `시간: ${schedule.schedule_time}` : "",
    schedule.customer_name ? `고객: ${schedule.customer_name}` : "",
    schedule.note || "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function writeScheduleWithFallback(query, schedule, payload) {
  const fallbackNote = buildScheduleFallbackNote(schedule);
  const variants = [
    payload,
    stripEmpty({
      title: schedule.title,
      customer_id: schedule.customer_id || null,
      schedule_date: schedule.schedule_date || null,
      schedule_time: schedule.schedule_time || null,
      schedule_type: schedule.schedule_type,
      note: schedule.note || fallbackNote,
      user_id: payload.user_id,
    }),
    stripEmpty({
      title: schedule.title,
      schedule_date: schedule.schedule_date || null,
      schedule_time: schedule.schedule_time || null,
      note: fallbackNote,
      user_id: payload.user_id,
    }),
    stripEmpty({
      title: schedule.title,
      schedule_date: schedule.schedule_date || null,
      note: fallbackNote,
      user_id: payload.user_id,
    }),
  ];

  let lastError = null;
  for (const variant of variants) {
    const response = schedule.id
      ? await query.update(variant).eq("id", schedule.id).select().single()
      : await query.insert(variant).select().single();

    if (!response.error) return response.data;
    lastError = response.error;
  }

  throw lastError;
}

function assertSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase 환경 변수가 설정되지 않았습니다.");
  }
}

export async function getProfile() {
  if (!isSupabaseConfigured) {
    try {
      return JSON.parse(localStorage.getItem("auth_user") || "null");
    } catch {
      return null;
    }
  }

  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getProfileByUsername(username) {
  const normalized = String(username || "").trim();
  if (!normalized) return null;

  if (!isSupabaseConfigured) {
    try {
      const saved = JSON.parse(localStorage.getItem("auth_user") || "null");
      return saved?.username === normalized ? saved : null;
    } catch {
      return null;
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, email")
    .eq("username", normalized)
    .maybeSingle();

  if (error) return null;
  return data;
}

export async function upsertProfile(profile) {
  if (!isSupabaseConfigured) {
    const saved = JSON.parse(localStorage.getItem("auth_user") || "{}");
    const next = { ...saved, ...profile };
    localStorage.setItem("auth_user", JSON.stringify(next));
    return next;
  }

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("로그인이 필요합니다.");

  const payload = stripEmpty({
    id: userId,
    username: profile.username,
    office_name: profile.office_name,
    manager_name: profile.manager_name,
    phone: profile.phone,
    email: profile.email,
    role: profile.role || "user",
    privacy_agreed: profile.privacy_agreed,
    updated_at: new Date().toISOString(),
  });

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}
export async function getCurrentUserId() {
  if (!isSupabaseConfigured || !supabase) return "local-user";
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

export async function listCustomers() {
  if (!isSupabaseConfigured) return readLocal(STORAGE_KEYS.customers);

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function saveCustomer(customer) {
  if (!isSupabaseConfigured) {
    const items = readLocal(STORAGE_KEYS.customers);
    const now = new Date().toISOString();
    const next = customer.id
      ? items.map((item) => (item.id === customer.id ? { ...item, ...customer } : item))
      : [{ ...customer, id: createLocalId(), created_at: now }, ...items];
    writeLocal(STORAGE_KEYS.customers, next);
    return customer.id ? next.find((item) => item.id === customer.id) : next[0];
  }

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("로그인이 필요합니다.");

  const customerPayload = pickFields(customer, CUSTOMER_FIELDS);
  const payload = stripEmpty({
    ...customerPayload,
    property_type: customerPayload.property_type || "사무실",
    inflow_date: customerPayload.inflow_date || null,
    user_id: userId,
  });
  const query = supabase.from("customers");
  return writeCustomerWithFallback(query, customer, payload);
}

export async function deleteCustomer(id) {
  if (!isSupabaseConfigured) {
    writeLocal(
      STORAGE_KEYS.customers,
      readLocal(STORAGE_KEYS.customers).filter((item) => item.id !== id)
    );
    return;
  }

  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
}

export async function listSchedules() {
  if (!isSupabaseConfigured) return readLocal(STORAGE_KEYS.schedules);

  const { data, error } = await supabase
    .from("schedules")
    .select("*")
    .order("schedule_date", { ascending: true })
    .order("schedule_time", { ascending: true });

  if (error) {
    const fallback = await supabase
      .from("schedules")
      .select("*")
      .order("created_at", { ascending: false });

    if (fallback.error) throw error;
    return fallback.data || [];
  }

  return data || [];
}

export async function saveSchedule(schedule) {
  if (!isSupabaseConfigured) {
    const items = readLocal(STORAGE_KEYS.schedules);
    const now = new Date().toISOString();
    const next = schedule.id
      ? items.map((item) => (item.id === schedule.id ? { ...item, ...schedule } : item))
      : [{ ...schedule, id: createLocalId(), created_at: now }, ...items];
    writeLocal(STORAGE_KEYS.schedules, next);
    return schedule.id ? next.find((item) => item.id === schedule.id) : next[0];
  }

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("로그인이 필요합니다.");

  const schedulePayload = pickFields(schedule, SCHEDULE_FIELDS);
  const payload = stripEmpty({
    ...schedulePayload,
    schedule_date: schedulePayload.schedule_date || null,
    schedule_time: schedulePayload.schedule_time || null,
    user_id: userId,
  });
  const query = supabase.from("schedules");
  return writeScheduleWithFallback(query, schedule, payload);
}

export async function deleteSchedule(id) {
  if (!isSupabaseConfigured) {
    writeLocal(
      STORAGE_KEYS.schedules,
      readLocal(STORAGE_KEYS.schedules).filter((item) => item.id !== id)
    );
    return;
  }

  const { error } = await supabase.from("schedules").delete().eq("id", id);
  if (error) throw error;
}

export async function listBrochures() {
  if (!isSupabaseConfigured) return readLocal(STORAGE_KEYS.brochures);

  const { data, error } = await supabase
    .from("brochures")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function listProperties() {
  if (!isSupabaseConfigured) return readLocal(STORAGE_KEYS.brochures);

  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function deleteBrochure(id) {
  if (!isSupabaseConfigured) {
    writeLocal(
      STORAGE_KEYS.brochures,
      readLocal(STORAGE_KEYS.brochures).filter((item) => item.id !== id)
    );
    return;
  }

  const { error } = await supabase.from("brochures").delete().eq("id", id);
  if (error) throw error;
}

function getPersistedImageUrl(image) {
  if (!image) return "";
  const value = typeof image === "string" ? image : image.url || "";
  return isHttpImageUrl(value) ? value : "";
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return String(year) + month + day;
}

function createRandomToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  }
  return Math.random().toString(36).slice(2, 12);
}

function createImageStoragePath(userId, extension = "webp") {
  return userId + "/" + getDateKey() + "/" + Date.now() + "_" + createRandomToken() + "." + extension;
}

export function getPublicImageUrl(path) {
  if (!path) return "";
  if (isHttpImageUrl(path)) return path;
  if (!isSupabaseConfigured || !supabase) return path;
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
  return data?.publicUrl || "";
}

export async function uploadPropertyImage(image) {
  if (!image) return "";

  const existingUrl = getPersistedImageUrl(image);
  const file = image.file || image;

  if (!isSupabaseConfigured || !supabase) return existingUrl;
  if (!hasBrowserFile(file)) return existingUrl;

  const userId = await getCurrentUserId();
  if (!userId || userId === "local-user") {
    throw new Error("??? ???? ???? ?????.");
  }

  const optimizedFile = await resizeImageFile(file);
  const extension = optimizedFile.type.includes("webp") ? "webp" : "jpg";
  const path = createImageStoragePath(userId, extension);

  const { error } = await supabase.storage.from(BUCKET_NAME).upload(path, optimizedFile, {
    cacheControl: "31536000",
    contentType: optimizedFile.type,
    upsert: false,
  });

  if (error) throw error;

  return getPublicImageUrl(path);
}

export async function savePropertyAndBrochure({ form, mainImage, extraImages, briefing }) {
  const uploadedMainImageUrl = await uploadPropertyImage(mainImage);
  const mainImageUrl = isHttpImageUrl(uploadedMainImageUrl) ? uploadedMainImageUrl : "";
  const extraImageUrls = (
    await Promise.all((extraImages || []).slice(0, 10).map((image) => uploadPropertyImage(image)))
  ).filter(isHttpImageUrl);

  const priceSummary = buildDisplayPriceSummary(form);
  const title = form.title || "무제 소개서";
  const payload = {
    title,
    address: form.address || "",
    deal_type: form.deal_type || "",
    price_summary: priceSummary,
    data: { form, briefing, main_image_url: mainImageUrl, extra_image_urls: extraImageUrls },
    main_image_url: mainImageUrl,
    extra_image_urls: extraImageUrls,
  };

  if (!isSupabaseConfigured) {
    const items = readLocal(STORAGE_KEYS.brochures);
    const item = {
      id: createLocalId(),
      ...payload,
      price: priceSummary,
      created_at: new Date().toISOString(),
    };
    writeLocal(STORAGE_KEYS.brochures, [item, ...items]);
    return item;
  }

  assertSupabase();
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("소개서 저장은 로그인이 필요합니다.");

  const propertyPayload = stripEmpty({ ...payload, user_id: userId });
  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .insert(propertyPayload)
    .select()
    .single();

  if (propertyError) throw propertyError;

  const brochurePayload = {
    user_id: userId,
    property_id: property.id,
    title,
    address: payload.address,
    deal_type: payload.deal_type,
    price: priceSummary,
    data: payload.data,
    brochure_url: "",
  };

  const { data: brochure, error: brochureError } = await supabase
    .from("brochures")
    .insert(brochurePayload)
    .select()
    .single();

  if (brochureError) throw brochureError;
  return { ...brochure, ...payload, property_id: property.id, price: priceSummary };
}
