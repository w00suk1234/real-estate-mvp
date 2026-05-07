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
  "source",
  "source_schedule_id",
  "inflow_date",
  "memo",
];

const SCHEDULE_FIELDS = [
  "title",
  "customer_id",
  "linked_customer_id",
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
      property_type: customer.property_type || "사무실",
      requirement: customer.wanted_condition,
      notes: customer.memo,
      inquiry_date: customer.inflow_date || null,
      contract_status: customer.contract_status,
      priority: customer.priority,
      source: customer.source,
      user_id: payload.user_id,
    }),
    stripEmpty({
      name: customer.name,
      phone: customer.phone,
      preferred_area: customer.preferred_area,
      wanted_condition: customer.wanted_condition,
      memo: customer.memo,
      inflow_date: customer.inflow_date || null,
      contract_status: customer.contract_status,
      priority: customer.priority,
      user_id: payload.user_id,
    }),
    stripEmpty({
      name: customer.name,
      phone: customer.phone,
      inflow_date: customer.inflow_date || null,
      contract_status: customer.contract_status,
      priority: customer.priority,
      user_id: payload.user_id,
    }),
    stripEmpty({
      name: customer.name,
      phone: customer.phone,
      inflow_date: customer.inflow_date || null,
      user_id: payload.user_id,
    }),
    stripEmpty({
      name: customer.name,
      phone: customer.phone,
      inquiry_date: customer.inflow_date || null,
      source: customer.source,
      contract_status: customer.contract_status,
      priority: customer.priority,
      user_id: payload.user_id,
    }),
    stripEmpty({
      name: customer.name,
      phone: customer.phone,
      inquiry_date: customer.inflow_date || null,
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
      linked_customer_id: schedule.linked_customer_id || schedule.customer_id || null,
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

function getPhoneLookupVariants(phone) {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return [];

  const dashed = digits.length <= 3
    ? digits
    : digits.length <= 7
      ? `${digits.slice(0, 3)}-${digits.slice(3)}`
      : `${digits.slice(0, 3)}-${digits.slice(3, digits.length === 10 ? 6 : 7)}-${digits.slice(digits.length === 10 ? 6 : 7)}`;

  return [...new Set([raw, digits, dashed])];
}

export async function getProfileByContact({ email, phone }) {
  const normalizedEmail = String(email || "").trim();
  const normalizedPhone = String(phone || "").trim();
  const phoneVariants = getPhoneLookupVariants(normalizedPhone);
  if (!normalizedEmail && !normalizedPhone) return null;

  if (!isSupabaseConfigured) {
    try {
      const saved = JSON.parse(localStorage.getItem("auth_user") || "null");
      if (!saved) return null;
      if (normalizedEmail && saved.email === normalizedEmail) return saved;
      if (phoneVariants.includes(String(saved.phone || "").trim())) return saved;
      return null;
    } catch {
      return null;
    }
  }

  if (normalizedEmail) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, email, phone")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (!error && data) return data;
  }

  if (phoneVariants.length) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, email, phone")
      .in("phone", phoneVariants)
      .limit(1)
      .maybeSingle();
    if (!error && data) return data;
  }

  return null;
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

const SETTLEMENT_STORAGE_KEY = "real_estate_mvp_settlements";
const SETTLEMENT_WAITING_STATUS = "정산대기";
const SETTLEMENT_DONE_STATUS = "정산완료";
const BALANCE_SETTLEMENT_TYPES = new Set(["잔금일", "잔금", "잔금날"]);

function parseSettlementMoney(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSettlementPayload(settlement = {}, userId) {
  const tenantFee = parseSettlementMoney(settlement.tenant_fee ?? settlement.tenantFee);
  const landlordFee = parseSettlementMoney(settlement.landlord_fee ?? settlement.landlordFee);
  const fallbackTotal = parseSettlementMoney(
    settlement.total_fee ?? settlement.totalFee ?? settlement.commission_amount ?? settlement.expected_amount,
  );
  const totalFee = tenantFee + landlordFee || fallbackTotal;
  const status = settlement.status === SETTLEMENT_DONE_STATUS ? SETTLEMENT_DONE_STATUS : settlement.status || SETTLEMENT_WAITING_STATUS;

  return stripEmpty({
    user_id: userId,
    customer_id: settlement.customer_id || settlement.linked_customer_id || null,
    customer_name: settlement.customer_name || settlement.name || "",
    customer_phone: settlement.customer_phone || settlement.phone || "",
    property_type: settlement.property_type || settlement.propertyType || "사무실",
    schedule_id: settlement.schedule_id || null,
    schedule_title: settlement.schedule_title || settlement.title || "",
    balance_date: settlement.balance_date || settlement.schedule_date || settlement.date || null,
    tenant_fee: tenantFee,
    landlord_fee: landlordFee,
    total_fee: totalFee,
    status,
    completed_at: status === SETTLEMENT_DONE_STATUS ? settlement.completed_at || new Date().toISOString() : settlement.completed_at || null,
    memo: settlement.memo || settlement.note || "",
    source: settlement.source || "수동등록",
    updated_at: new Date().toISOString(),
  });
}

function normalizeSettlementRow(row = {}) {
  const tenantFee = parseSettlementMoney(row.tenant_fee ?? row.tenantFee);
  const landlordFee = parseSettlementMoney(row.landlord_fee ?? row.landlordFee);
  const totalFee = tenantFee + landlordFee || parseSettlementMoney(row.total_fee ?? row.commission_amount);

  return {
    ...row,
    customer_name: row.customer_name || row.name || "",
    customer_phone: row.customer_phone || row.phone || "",
    phone: row.phone || row.customer_phone || "",
    tenant_fee: tenantFee,
    landlord_fee: landlordFee,
    total_fee: totalFee,
    commission_amount: totalFee,
    status: row.status || SETTLEMENT_WAITING_STATUS,
  };
}

function upsertLocalSettlement(settlement) {
  const rows = readLocal(SETTLEMENT_STORAGE_KEY, []).map(normalizeSettlementRow);
  const next = normalizeSettlementRow({
    ...settlement,
    id: settlement.id || createLocalId(),
    created_at: settlement.created_at || new Date().toISOString(),
  });
  const index = rows.findIndex((item) => {
    if (next.id && item.id === next.id) return true;
    if (next.customer_id && item.customer_id === next.customer_id) return true;
    if (next.schedule_id && item.schedule_id === next.schedule_id) return true;
    return false;
  });
  const merged = index >= 0 ? rows.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item)) : [next, ...rows];
  writeLocal(SETTLEMENT_STORAGE_KEY, merged);
  return next;
}

export async function listSettlements() {
  if (!isSupabaseConfigured) {
    return readLocal(SETTLEMENT_STORAGE_KEY, []).map(normalizeSettlementRow);
  }

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("settlements")
    .select("*")
    .eq("user_id", userId)
    .order("balance_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeSettlementRow);
}

export async function saveSettlement(settlement = {}) {
  if (!isSupabaseConfigured) {
    return upsertLocalSettlement(normalizeSettlementPayload(settlement, "local-user"));
  }

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("로그인 후 정산 정보를 저장할 수 있습니다.");

  const payload = normalizeSettlementPayload(settlement, userId);
  const id = settlement.id;

  if (id) {
    const { data, error } = await supabase
      .from("settlements")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw error;
    return normalizeSettlementRow(data);
  }

  const { data, error } = await supabase.from("settlements").insert(payload).select("*").single();
  if (error) throw error;
  return normalizeSettlementRow(data);
}

export async function upsertSettlementFromSchedule(schedule = {}, customer = {}) {
  const scheduleType = schedule.schedule_type || schedule.type;
  if (!BALANCE_SETTLEMENT_TYPES.has(scheduleType)) return null;

  const customerId = schedule.customer_id || schedule.linked_customer_id || customer.id;
  if (!customerId) return null;

  const settlements = await listSettlements();
  const existing = settlements.find((item) => item.customer_id && String(item.customer_id) === String(customerId));
  const isCompleted = existing?.status === SETTLEMENT_DONE_STATUS;

  return saveSettlement({
    ...(existing || {}),
    customer_id: customerId,
    customer_name: customer.name || schedule.customer_name || existing?.customer_name || "",
    customer_phone: customer.phone || customer.contact || existing?.customer_phone || "",
    property_type: customer.property_type || existing?.property_type || "사무실",
    schedule_id: schedule.id || existing?.schedule_id || null,
    schedule_title: schedule.title || existing?.schedule_title || "",
    balance_date: schedule.schedule_date || existing?.balance_date || null,
    memo: schedule.note || existing?.memo || "",
    source: "잔금일정",
    status: isCompleted ? SETTLEMENT_DONE_STATUS : existing?.status || SETTLEMENT_WAITING_STATUS,
    completed_at: existing?.completed_at || null,
    tenant_fee: existing?.tenant_fee || 0,
    landlord_fee: existing?.landlord_fee || 0,
    total_fee: existing?.total_fee || 0,
  });
}

export async function completeSettlement(settlementId) {
  const settlements = await listSettlements();
  const existing = settlements.find((item) => String(item.id) === String(settlementId));
  if (!existing) throw new Error("정산 항목을 찾을 수 없습니다.");
  if (existing.status === SETTLEMENT_DONE_STATUS) return existing;

  return saveSettlement({
    ...existing,
    status: SETTLEMENT_DONE_STATUS,
    completed_at: new Date().toISOString(),
  });
}

export async function deleteSettlement(settlementId) {
  if (!isSupabaseConfigured) {
    const rows = readLocal(SETTLEMENT_STORAGE_KEY, []).filter((item) => String(item.id) !== String(settlementId));
    writeLocal(SETTLEMENT_STORAGE_KEY, rows);
    return true;
  }

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("로그인 후 정산 정보를 삭제할 수 있습니다.");

  const { error } = await supabase.from("settlements").delete().eq("id", settlementId).eq("user_id", userId);
  if (error) throw error;
  return true;
}

export async function getSettlementRevenueSummary() {
  const settlements = await listSettlements();
  const completed = settlements.filter((item) => item.status === SETTLEMENT_DONE_STATUS);
  return {
    completed_count: completed.length,
    total_revenue: completed.reduce((sum, item) => sum + parseSettlementMoney(item.total_fee ?? item.commission_amount), 0),
  };
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


