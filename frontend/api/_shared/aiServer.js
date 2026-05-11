import { createClient } from "@supabase/supabase-js";
import {
  createRuleBasedBriefing,
  normalizeBriefingCustomer,
  normalizeBriefingProperty,
  sanitizeForLlmPayload,
  validateAndRepairBriefing,
} from "../../src/utils/aiBriefing.js";

export const FEATURE = "ai_briefing";

const PRICE_BY_MODEL = {
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25 },
};

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export function getAiConfig() {
  const env = process.env;
  return {
    openaiApiKey: env.OPENAI_API_KEY || "",
    model: env.OPENAI_MODEL || "gpt-5-nano",
    modelFallback: env.OPENAI_MODEL_FALLBACK || env.OPENAI_MODEL || "gpt-5-nano",
    enableLlm: String(env.AI_ENABLE_LLM ?? "true").toLowerCase() !== "false",
    monthlyLimit: Number(env.AI_MONTHLY_USD_HARD_LIMIT || 5),
    dailyLimit: Number(env.AI_DAILY_USD_HARD_LIMIT || 0.5),
    perRequestLimit: Number(env.AI_PER_REQUEST_USD_HARD_LIMIT || 0.02),
    maxInputTokens: Number(env.AI_MAX_INPUT_TOKENS || 6000),
    maxOutputTokens: Number(env.AI_MAX_OUTPUT_TOKENS || 1200),
    maxInputChars: Number(env.AI_MAX_INPUT_CHARS || 16000),
    maxPropertyCount: Number(env.AI_MAX_PROPERTY_COUNT || 5),
    minPropertyCount: Number(env.AI_MIN_PROPERTY_COUNT || 2),
    memoMaxChars: Number(env.AI_MEMO_MAX_CHARS || 500),
    timeoutMs: Number(env.AI_TIMEOUT_MS || 60000),
    retryCount: Math.min(1, Number(env.AI_RETRY_COUNT || 0)),
    showCostToAdmin: String(env.AI_SHOW_COST_TO_ADMIN ?? "true").toLowerCase() !== "false",
  };
}

export function estimateTokensFromChars(value) {
  return Math.ceil(String(value || "").length / 2);
}

export function estimateCostUsd({ model, inputTokens, outputTokens, cachedInputTokens = 0 }) {
  const price = PRICE_BY_MODEL[model] || PRICE_BY_MODEL["gpt-5-nano"];
  const nonCached = Math.max(0, inputTokens - cachedInputTokens);
  return (nonCached * price.input + cachedInputTokens * price.cachedInput + outputTokens * price.output) / 1_000_000;
}

export function getSupabaseEnv() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  return { url, anonKey };
}

export function createAuthedSupabase(req) {
  const { url, anonKey } = getSupabaseEnv();
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!url || !anonKey) throw new Error("Supabase 환경 변수가 설정되지 않았습니다.");
  if (!token) throw new Error("로그인이 필요합니다.");
  return {
    token,
    supabase: createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }),
  };
}

export async function getRequestUser(supabase, token) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) throw new Error("로그인이 필요합니다.");
  return data.user;
}

export async function loadCustomerAndProperties(supabase, userId, customerId, propertyIds = []) {
  const uniqueIds = [...new Set(propertyIds.map(String).filter(Boolean))];
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("user_id", userId)
    .maybeSingle();
  if (customerError) throw customerError;
  if (!customer) throw new Error("접근 가능한 고객을 찾지 못했습니다.");

  const { data: properties, error: propertyError } = await supabase
    .from("properties")
    .select("*")
    .in("id", uniqueIds)
    .eq("user_id", userId);
  if (propertyError) throw propertyError;
  if ((properties || []).length !== uniqueIds.length) {
    throw new Error("접근 가능한 매물만 브리핑에 사용할 수 있습니다.");
  }
  return { customer, properties: properties || [] };
}

export function buildRuleResult(customer, properties, focus = [], mode = "rule_based", model = "") {
  const normalizedCustomer = normalizeBriefingCustomer(customer);
  const normalizedProperties = properties.map(normalizeBriefingProperty);
  const ruleResult = createRuleBasedBriefing({ customer: normalizedCustomer, properties: normalizedProperties, focus, mode, model });
  const scoredResults = ruleResult.briefing.rankings.map((ranking) => ({
    propertyId: ranking.propertyId,
    rank: ranking.rank,
    score: ranking.score,
    grade: ranking.grade,
    matched: ranking.strengths || [],
    concerns: ranking.concerns || [],
    missingChecks: ruleResult.briefing.missingChecks || [],
  }));
  return { normalizedCustomer, normalizedProperties, ruleResult, scoredResults };
}

export async function getUsageSums(supabase, userId) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

  try {
    const [month, day] = await Promise.all([
      supabase.from("ai_usage_logs").select("estimated_cost_usd, actual_cost_usd").eq("user_id", userId).gte("created_at", monthStart),
      supabase.from("ai_usage_logs").select("estimated_cost_usd, actual_cost_usd").eq("user_id", userId).gte("created_at", dayStart),
    ]);
    if (month.error || day.error) return { monthUsd: 0, dayUsd: 0 };
    const sum = (rows = []) => rows.reduce((total, row) => total + Number(row.actual_cost_usd ?? row.estimated_cost_usd ?? 0), 0);
    return { monthUsd: sum(month.data), dayUsd: sum(day.data) };
  } catch {
    return { monthUsd: 0, dayUsd: 0 };
  }
}

export async function logUsage(supabase, row) {
  try {
    await supabase.from("ai_usage_logs").insert({
      feature: FEATURE,
      ...row,
      estimated_cost_usd: Number(row.estimated_cost_usd || 0),
      created_at: new Date().toISOString(),
    });
  } catch {
    // Usage logging must never break the user-facing fallback path.
  }
}

export async function saveBriefing(supabase, { userId, customerId, propertyIds, result, title }) {
  try {
    const briefing = result.briefing;
    const { data, error } = await supabase
      .from("ai_briefings")
      .insert({
        user_id: userId,
        customer_id: customerId,
        title: title || briefing.brochureCopy?.title || "AI 브리핑",
        summary: briefing.summary,
        result_json: briefing,
        model: result.model || null,
        mode: result.mode,
        estimated_cost_usd: result.estimatedCostUsd ?? null,
        actual_cost_usd: result.actualCostUsd ?? null,
        input_tokens: result.inputTokens ?? null,
        output_tokens: result.outputTokens ?? null,
        total_tokens: result.totalTokens ?? null,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;

    const rankingByPropertyId = new Map((briefing.rankings || []).map((item) => [String(item.propertyId), item]));
    const rows = propertyIds.map((propertyId) => {
      const ranking = rankingByPropertyId.get(String(propertyId));
      return {
        ai_briefing_id: data.id,
        property_id: propertyId,
        rank: ranking?.rank || null,
        score: ranking?.score || null,
      };
    });
    if (rows.length) await supabase.from("ai_briefing_properties").insert(rows);
    return data;
  } catch {
    return null;
  }
}

export const SYSTEM_PROMPT = `
너는 한국 부동산 중개업무를 돕는 AI 브리핑 작성 도우미다.
너의 역할은 고객 조건과 후보 매물의 룰베이스 평가 결과를 바탕으로 중개사가 상담에 바로 쓸 수 있는 설명을 작성하는 것이다.

중요 규칙:
- 점수와 순위는 이미 계산된 값을 그대로 사용한다.
- 순위를 바꾸지 않는다.
- propertyId, rank, score는 입력값과 동일해야 한다.
- 없는 정보를 만들어내지 않는다.
- 이동시간, 월세 조정 가능성, 주차 가능 대수, 업종 가능 여부는 데이터가 없으면 단정하지 않는다.
- 불확실한 내용은 “확인 필요”로 표시한다.
- 매물 단점은 숨기지 말고 부드럽게 표현한다.
- 고객에게 보내는 문안은 과장 광고처럼 쓰지 말고, 중개사가 실제 카톡으로 보낼 수 있는 자연스러운 한국어로 작성한다.
- 공정거래/허위매물 오해가 생길 표현은 피한다.
- 법률/계약 관련 판단은 단정하지 않는다.
- 고객을 압박하는 표현을 피한다.
- '무조건', '확실히', '보장', '수익 보장', '계약 확정' 같은 표현을 피한다.
- 출력은 지정된 JSON schema만 반환한다.
`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "recommendationComment", "rankings", "brokerNote", "customerMessages", "brochureCopy", "missingChecks"],
  properties: {
    summary: { type: "string" },
    recommendationComment: { type: "string" },
    rankings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["propertyId", "rank", "score", "displayName", "shortReason", "strengths", "concerns", "talkingPoints"],
        properties: {
          propertyId: { type: "string" },
          rank: { type: "number" },
          score: { type: "number" },
          displayName: { type: "string" },
          shortReason: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          concerns: { type: "array", items: { type: "string" } },
          talkingPoints: { type: "array", items: { type: "string" } },
        },
      },
    },
    brokerNote: { type: "string" },
    customerMessages: {
      type: "object",
      additionalProperties: false,
      required: ["short", "normal", "softPersuasive"],
      properties: {
        short: { type: "string" },
        normal: { type: "string" },
        softPersuasive: { type: "string" },
      },
    },
    brochureCopy: {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "bullets"],
      properties: {
        title: { type: "string" },
        summary: { type: "string" },
        bullets: { type: "array", items: { type: "string" } },
      },
    },
    missingChecks: { type: "array", items: { type: "string" } },
  },
};

export async function callOpenAiBriefing({ config, llmPayload, ruleBriefing, scoredResults }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        instructions: SYSTEM_PROMPT,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(llmPayload),
              },
            ],
          },
        ],
        max_output_tokens: config.maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name: "agentnote_ai_briefing",
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
        tools: [],
        store: false,
      }),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`OpenAI 응답 시간이 ${config.timeoutMs}ms를 초과했습니다.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let detail = errorText;
    try {
      const parsed = JSON.parse(errorText);
      detail = parsed?.error?.message || parsed?.message || errorText;
      const code = parsed?.error?.code || parsed?.error?.type || "";
      if (code) detail = `${code}: ${detail}`;
    } catch {
      // Keep the raw text if OpenAI returned a non-JSON error body.
    }
    throw new Error(`OpenAI ${response.status}: ${detail || response.statusText}`);
  }

  const data = await response.json();
  const outputText =
    data.output_text ||
    (data.output || [])
      .flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text" || item.type === "text")
      .map((item) => item.text)
      .join("");
  if (!outputText) throw new Error("OpenAI 응답이 비어 있습니다.");

  const parsed = JSON.parse(outputText);
  const validated = validateAndRepairBriefing(parsed, ruleBriefing, scoredResults);
  if (!validated) throw new Error("LLM 응답 검증에 실패했습니다.");
  return { briefing: validated, usage: data.usage || {} };
}

export function getPublicFallbackReason(error) {
  const message = String(error?.message || error || "").replace(/sk-[A-Za-z0-9_-]+/g, "sk-***");
  if (!message) return "OpenAI 호출 실패";
  if (/timeout|timed out|초과|AbortError/i.test(message)) {
    return "OpenAI 응답 시간이 초과되어 룰베이스로 대체했습니다. Vercel 환경변수 AI_TIMEOUT_MS를 60000으로 늘리면 해결될 수 있습니다.";
  }
  if (/unsupported|unknown parameter|invalid_request_error|400/i.test(message)) {
    return `OpenAI 요청 형식 오류로 룰베이스로 대체했습니다. ${message.slice(0, 220)}`;
  }
  if (/model|does not exist|not found|invalid_model/i.test(message)) {
    return "OpenAI 모델명을 확인해야 합니다. Vercel의 OPENAI_MODEL 값이 사용 가능한 모델인지 확인해 주세요.";
  }
  if (/quota|billing|insufficient_quota|exceeded/i.test(message)) {
    return "OpenAI 결제/크레딧/쿼터 문제로 호출이 실패했습니다. OpenAI 계정 Billing과 Usage limit을 확인해 주세요.";
  }
  if (/invalid_api_key|incorrect api key|401|unauthorized/i.test(message)) {
    return "OpenAI API 키 인증에 실패했습니다. OPENAI_API_KEY 값을 다시 확인해 주세요.";
  }
  if (/json|schema|validation|검증/i.test(message)) {
    return `OpenAI 응답 형식 검증에 실패해 룰베이스로 대체했습니다. ${message.slice(0, 180)}`;
  }
  return `OpenAI 호출이 실패해 룰베이스로 대체했습니다. ${message.slice(0, 220)}`;
}

export function prepareLlmBudget({ config, llmPayload, usageSums }) {
  const requestText = JSON.stringify(llmPayload);
  const inputTokens = estimateTokensFromChars(requestText);
  const outputTokens = config.maxOutputTokens;
  const estimatedCostUsd = estimateCostUsd({ model: config.model, inputTokens, outputTokens });
  const blocked =
    requestText.length > config.maxInputChars ||
    inputTokens > config.maxInputTokens ||
    estimatedCostUsd > config.perRequestLimit ||
    usageSums.monthUsd + estimatedCostUsd > config.monthlyLimit ||
    usageSums.dayUsd + estimatedCostUsd > config.dailyLimit;

  return {
    requestText,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
    blocked,
    reason:
      requestText.length > config.maxInputChars || inputTokens > config.maxInputTokens
        ? "input_limit"
        : estimatedCostUsd > config.perRequestLimit
          ? "per_request_limit"
          : usageSums.monthUsd + estimatedCostUsd > config.monthlyLimit
            ? "monthly_limit"
            : usageSums.dayUsd + estimatedCostUsd > config.dailyLimit
              ? "daily_limit"
              : "",
  };
}

export function buildLlmPayload(customer, properties, scoredResults) {
  return sanitizeForLlmPayload({ customer, properties, ruleBasedResults: scoredResults });
}
