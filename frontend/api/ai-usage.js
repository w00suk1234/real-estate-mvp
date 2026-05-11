import {
  createAuthedSupabase,
  getRequestUser,
  getUsageSums,
  sendJson,
} from "./_shared/aiServer.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const auth = createAuthedSupabase(req);
    const supabase = auth.supabase;
    const user = await getRequestUser(supabase, auth.token);
    const usage = await getUsageSums(supabase, user.id);
    const { data, error } = await supabase
      .from("ai_usage_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return sendJson(res, 200, {
      todayUsd: usage.dayUsd,
      monthUsd: usage.monthUsd,
      recent: data || [],
    });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || "사용량 조회 중 오류가 발생했습니다." });
  }
}
