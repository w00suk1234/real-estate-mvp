import {
  buildLlmPayload,
  buildRuleResult,
  callOpenAiBriefing,
  createAuthedSupabase,
  estimateCostUsd,
  getAiConfig,
  getRequestUser,
  getUsageSums,
  loadCustomerAndProperties,
  logUsage,
  prepareLlmBudget,
  readJson,
  saveBriefing,
  sendJson,
} from "../_shared/aiServer.js";

function methodNotAllowed(res) {
  res.setHeader("Allow", "POST");
  sendJson(res, 405, { error: "Method not allowed" });
}

function publicError(error) {
  const message = String(error?.message || "");
  if (message.includes("로그인")) return message;
  if (message.includes("고객") || message.includes("매물")) return message;
  return "AI 브리핑 생성 중 오류가 발생했습니다. 룰베이스 브리핑으로 다시 시도해 주세요.";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  let supabase;
  let user;
  let result;
  let inputTokens = null;
  let outputTokens = null;
  let totalTokens = null;
  let estimatedCostUsd = 0;
  let actualCostUsd = null;
  let errorForLog = null;

  try {
    const body = await readJson(req);
    const config = getAiConfig();
    const propertyIds = [...new Set((body.propertyIds || []).map(String).filter(Boolean))];
    const focus = Array.isArray(body.focus) ? body.focus.map(String) : [];

    if (!body.customerId) throw new Error("고객을 선택해 주세요.");
    if (propertyIds.length < config.minPropertyCount) throw new Error(`후보 매물은 최소 ${config.minPropertyCount}개 선택해 주세요.`);
    if (propertyIds.length > config.maxPropertyCount) throw new Error(`후보 매물은 최대 ${config.maxPropertyCount}개까지 선택할 수 있습니다.`);

    const auth = createAuthedSupabase(req);
    supabase = auth.supabase;
    user = await getRequestUser(supabase, auth.token);
    const { customer, properties } = await loadCustomerAndProperties(supabase, user.id, body.customerId, propertyIds);
    const { ruleResult, scoredResults } = buildRuleResult(customer, properties, focus, "rule_based", config.model);
    result = {
      ...ruleResult,
      mode: "rule_based",
      model: config.model,
      estimatedCostUsd: 0,
    };

    const llmPayload = buildLlmPayload(customer, properties, scoredResults);
    const requestChars = JSON.stringify(llmPayload).length;

    if (!config.enableLlm) {
      result.mode = "rule_based";
    } else if (!config.openaiApiKey) {
      result.mode = "api_key_missing";
    } else {
      const usageSums = await getUsageSums(supabase, user.id);
      const budget = prepareLlmBudget({ config, llmPayload, usageSums });
      inputTokens = budget.inputTokens;
      outputTokens = budget.outputTokens;
      estimatedCostUsd = budget.estimatedCostUsd;
      result.estimatedCostUsd = estimatedCostUsd;

      if (budget.blocked) {
        result.mode = "budget_exceeded";
      } else {
        try {
          const openAi = await callOpenAiBriefing({ config, llmPayload, ruleBriefing: ruleResult.briefing, scoredResults });
          const usage = openAi.usage || {};
          inputTokens = usage.input_tokens ?? inputTokens;
          outputTokens = usage.output_tokens ?? null;
          totalTokens = usage.total_tokens ?? null;
          actualCostUsd =
            inputTokens || outputTokens
              ? estimateCostUsd({
                  model: config.model,
                  inputTokens: inputTokens || 0,
                  outputTokens: outputTokens || 0,
                  cachedInputTokens: usage.input_tokens_details?.cached_tokens || 0,
                })
              : null;
          result = {
            mode: "llm",
            model: config.model,
            estimatedCostUsd,
            actualCostUsd,
            inputTokens,
            outputTokens,
            totalTokens,
            briefing: openAi.briefing,
          };
        } catch (error) {
          errorForLog = error;
          result.mode = "fallback";
        }
      }
    }

    const saved = await saveBriefing(supabase, {
      userId: user.id,
      customerId: body.customerId,
      propertyIds,
      result,
      title: result.briefing?.brochureCopy?.title,
    });

    await logUsage(supabase, {
      user_id: user.id,
      ai_briefing_id: saved?.id || null,
      model: result.model,
      mode: result.mode,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCostUsd || result.estimatedCostUsd || 0,
      actual_cost_usd: actualCostUsd,
      request_chars: requestChars,
      response_chars: JSON.stringify(result.briefing || {}).length,
      error_code: errorForLog ? "openai_error" : null,
      error_message: errorForLog ? String(errorForLog.message || errorForLog).slice(0, 500) : null,
    });

    return sendJson(res, 200, {
      ...result,
      briefingId: saved?.id || null,
      fallbackMessage:
        result.mode === "llm" ? "" : "AI 호출을 사용하지 않고 룰베이스 브리핑으로 생성했습니다.",
    });
  } catch (error) {
    if (supabase && user) {
      await logUsage(supabase, {
        user_id: user.id,
        model: getAiConfig().model,
        mode: "error",
        estimated_cost_usd: estimatedCostUsd,
        error_code: "generate_error",
        error_message: String(error?.message || error).slice(0, 500),
      });
    }
    return sendJson(res, 400, { error: publicError(error) });
  }
}
