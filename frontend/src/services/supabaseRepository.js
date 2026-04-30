import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { buildPriceSummary as buildDisplayPriceSummary } from "../utils/brochure";

const BUCKET_NAME = "property-images";
const STORAGE_KEYS = {
  customers: "real_estate_mvp_customers",
  schedules: "real_estate_mvp_schedules",
  brochures: "real_estate_mvp_brochures",
};

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

  const payload = stripEmpty({ ...customer, user_id: userId });
  const query = supabase.from("customers");
  const { data, error } = customer.id
    ? await query.update(payload).eq("id", customer.id).select().single()
    : await query.insert(payload).select().single();

  if (error) throw error;
  return data;
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

  if (error) throw error;
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

  const payload = stripEmpty({ ...schedule, user_id: userId });
  const query = supabase.from("schedules");
  const { data, error } = schedule.id
    ? await query.update(payload).eq("id", schedule.id).select().single()
    : await query.insert(payload).select().single();

  if (error) throw error;
  return data;
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

function sanitizeStorageName(name = "image") {
  return String(name)
    .normalize("NFKC")
    .replace(/[^\w.\-\uAC00-\uD7A3]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

function getImageUrl(image) {
  if (!image) return "";
  if (typeof image === "string") return image;
  return image.url || image.preview || "";
}

export async function uploadPropertyImage(image, folder = "properties") {
  if (!image) return "";

  const existingUrl = getImageUrl(image);
  const file = image.file || image;

  if (!isSupabaseConfigured || !hasBrowserFile(file)) return existingUrl;

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("이미지 업로드는 로그인이 필요합니다.");

  const name = file.name || "image.jpg";
  const path = `${userId}/${folder}/${Date.now()}-${sanitizeStorageName(name)}`;
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
  return data?.publicUrl || "";
}

export async function savePropertyAndBrochure({ form, mainImage, extraImages, briefing }) {
  const mainImageUrl = await uploadPropertyImage(mainImage, "main");
  const extraImageUrls = (
    await Promise.all((extraImages || []).slice(0, 10).map((image) => uploadPropertyImage(image, "extra")))
  ).filter(Boolean);

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

