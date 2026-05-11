import {
  createAuthedSupabase,
  getRequestUser,
  readJson,
  sendJson,
} from "./_shared/aiServer.js";

const FEEDBACK_TYPES = new Set([
  "interested",
  "visit_requested",
  "price_burden",
  "location_bad",
  "parking_issue",
  "size_small",
  "size_large",
  "hold",
  "rejected",
  "other",
]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const body = await readJson(req);
    const auth = createAuthedSupabase(req);
    const supabase = auth.supabase;
    const user = await getRequestUser(supabase, auth.token);
    const feedbackType = FEEDBACK_TYPES.has(body.feedbackType) ? body.feedbackType : "other";

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id")
      .eq("id", body.customerId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer) throw new Error("접근 가능한 고객을 찾지 못했습니다.");

    if (body.propertyId) {
      const { data: property, error: propertyError } = await supabase
        .from("properties")
        .select("id")
        .eq("id", body.propertyId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (propertyError) throw propertyError;
      if (!property) throw new Error("접근 가능한 매물을 찾지 못했습니다.");
    }

    const { data, error } = await supabase
      .from("customer_property_feedback")
      .insert({
        customer_id: body.customerId,
        property_id: body.propertyId || null,
        ai_briefing_id: body.aiBriefingId || null,
        feedback_type: feedbackType,
        memo: String(body.memo || "").slice(0, 500),
      })
      .select("*")
      .single();
    if (error) throw error;
    return sendJson(res, 200, { item: data });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || "고객 반응 저장 중 오류가 발생했습니다." });
  }
}
