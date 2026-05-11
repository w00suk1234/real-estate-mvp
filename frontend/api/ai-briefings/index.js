import {
  createAuthedSupabase,
  getRequestUser,
  readJson,
  sendJson,
} from "../_shared/aiServer.js";

export default async function handler(req, res) {
  try {
    const auth = createAuthedSupabase(req);
    const supabase = auth.supabase;
    const user = await getRequestUser(supabase, auth.token);

    if (req.method === "GET") {
      const customerId = new URL(req.url, "http://localhost").searchParams.get("customerId");
      let query = supabase
        .from("ai_briefings")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (customerId) query = query.eq("customer_id", customerId);
      const { data, error } = await query;
      if (error) throw error;
      return sendJson(res, 200, { items: data || [] });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const { data, error } = await supabase
        .from("ai_briefings")
        .insert({
          user_id: user.id,
          customer_id: body.customerId || null,
          title: body.title || body.briefing?.brochureCopy?.title || "AI 브리핑",
          summary: body.briefing?.summary || "",
          result_json: body.briefing || {},
          model: body.model || null,
          mode: body.mode || "rule_based",
          estimated_cost_usd: body.estimatedCostUsd ?? null,
          actual_cost_usd: body.actualCostUsd ?? null,
          input_tokens: body.inputTokens ?? null,
          output_tokens: body.outputTokens ?? null,
          total_tokens: body.totalTokens ?? null,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw error;
      return sendJson(res, 200, { item: data });
    }

    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || "요청 처리 중 오류가 발생했습니다." });
  }
}
