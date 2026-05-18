import { getAiConfig, readJson, sendJson } from "./_shared/aiServer.js";

export const config = {
  maxDuration: 60,
};

const SYSTEM_PROMPT = `
너는 한국 부동산 중개사용 AI 브리핑 도우미다.
고객 조건과 후보 매물을 비교해서 중개사가 상담에 바로 사용할 수 있는 브리핑을 작성한다.
없는 정보는 지어내지 않는다.
법률/세무 판단은 확정하지 말고 확인 필요로 표현한다.
출력은 반드시 JSON 형태로 반환한다.

작성 규칙:
- 고객에게 부담을 주는 과장 표현, 보장 표현, 계약 확정처럼 단정적인 표현은 피한다.
- 입력에 없는 주차 대수, 월세 조정 가능성, 이동 시간, 업종 가능 여부는 만들지 않는다.
- 법률, 세무, 권리관계, 계약 관련 내용은 "확인 필요"로만 표현한다.
- ranking은 고객 조건과 후보 매물의 적합도를 비교해 rank 1부터 정렬한다.
- fitScore는 반드시 "높음", "보통", "낮음" 중 하나만 사용한다.
- customerMessage는 중개사가 고객에게 보낼 수 있는 짧은 카톡/문자 초안으로 작성한다.
- checkPoints는 중개사가 상담 전후로 추가 확인해야 할 사항만 넣는다.
`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "customerSummary",
    "recommendationSummary",
    "ranking",
    "consultingMemo",
    "customerMessage",
    "checkPoints",
  ],
  properties: {
    customerSummary: { type: "string" },
    recommendationSummary: { type: "string" },
    ranking: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "propertyId",
          "rank",
          "title",
          "fitScore",
          "reason",
          "weakPoint",
          "talkingPoint",
        ],
        properties: {
          propertyId: { type: "string" },
          rank: { type: "number" },
          title: { type: "string" },
          fitScore: { type: "string", enum: ["높음", "보통", "낮음"] },
          reason: { type: "string" },
          weakPoint: { type: "string" },
          talkingPoint: { type: "string" },
        },
      },
    },
    consultingMemo: { type: "string" },
    customerMessage: { type: "string" },
    checkPoints: {
      type: "array",
      items: { type: "string" },
    },
  },
};

function methodNotAllowed(res) {
  res.setHeader("Allow", "POST");
  sendJson(res, 405, { error: "Method not allowed" });
}

function cleanText(value, max = 700) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

function cleanCustomer(customer = {}) {
  return {
    name: cleanText(customer.name, 120),
    desiredRegion: cleanText(customer.desiredRegion, 180),
    budget: cleanText(customer.budget, 180),
    deposit: cleanText(customer.deposit, 120),
    monthlyRent: cleanText(customer.monthlyRent, 120),
    propertyType: cleanText(customer.propertyType, 160),
    memo: cleanText(customer.memo, 700),
  };
}

function cleanProperty(property = {}) {
  return {
    id: cleanText(property.id, 120),
    title: cleanText(property.title, 180),
    address: cleanText(property.address, 220),
    price: cleanText(property.price, 180),
    deposit: cleanText(property.deposit, 120),
    monthlyRent: cleanText(property.monthlyRent, 120),
    area: cleanText(property.area, 120),
    floor: cleanText(property.floor, 120),
    parking: cleanText(property.parking, 120),
    elevator: cleanText(property.elevator, 120),
    moveInDate: cleanText(property.moveInDate, 120),
    memo: cleanText(property.memo, 700),
  };
}

function buildPayload(body) {
  const customer = cleanCustomer(body.customer || {});
  const properties = Array.isArray(body.properties) ? body.properties.map(cleanProperty) : [];
  const criteria = Array.isArray(body.criteria)
    ? body.criteria.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 10)
    : [];

  if (!customer.name && !customer.desiredRegion && !customer.memo) {
    throw new Error("고객 조건을 확인할 수 없습니다.");
  }
  if (properties.length < 2) {
    throw new Error("후보 매물은 최소 2개 이상 필요합니다.");
  }
  if (properties.some((property) => !property.id)) {
    throw new Error("후보 매물 id가 누락되었습니다.");
  }

  return {
    customer,
    properties: properties.slice(0, 8),
    criteria,
  };
}

function extractOutputText(data) {
  return (
    data.output_text ||
    (data.output || [])
      .flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text" || item.type === "text")
      .map((item) => item.text || item.output_text || "")
      .join("")
  );
}

function normalizeResult(result, properties) {
  const propertyIds = new Set(properties.map((property) => String(property.id)));
  const ranking = Array.isArray(result.ranking)
    ? result.ranking
        .filter((item) => propertyIds.has(String(item.propertyId)))
        .map((item, index) => ({
          propertyId: String(item.propertyId || ""),
          rank: Number(item.rank || index + 1),
          title: cleanText(item.title, 180),
          fitScore: ["높음", "보통", "낮음"].includes(item.fitScore) ? item.fitScore : "보통",
          reason: cleanText(item.reason, 700),
          weakPoint: cleanText(item.weakPoint, 700),
          talkingPoint: cleanText(item.talkingPoint, 700),
        }))
        .sort((a, b) => a.rank - b.rank)
    : [];

  if (!ranking.length) {
    throw new Error("AI 응답에 유효한 추천 순위가 없습니다.");
  }

  return {
    customerSummary: cleanText(result.customerSummary, 900),
    recommendationSummary: cleanText(result.recommendationSummary, 900),
    ranking,
    consultingMemo: cleanText(result.consultingMemo, 1200),
    customerMessage: cleanText(result.customerMessage, 900),
    checkPoints: Array.isArray(result.checkPoints)
      ? result.checkPoints.map((item) => cleanText(item, 300)).filter(Boolean).slice(0, 12)
      : [],
  };
}

async function callOpenAi(payload) {
  const config = getAiConfig();
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY가 서버 환경 변수에 설정되지 않았습니다.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
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
                text: JSON.stringify(payload),
              },
            ],
          },
        ],
        max_output_tokens: Math.min(config.maxOutputTokens || 1800, 2200),
        reasoning: { effort: "minimal" },
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "agentnote_consulting_briefing",
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
        store: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let detail = errorText || response.statusText;
      try {
        const parsed = JSON.parse(errorText);
        detail = parsed?.error?.message || parsed?.message || detail;
      } catch {
        // Keep the raw error text.
      }
      throw new Error(`OpenAI ${response.status}: ${detail}`);
    }

    const data = await response.json();
    const outputText = extractOutputText(data);
    if (!outputText) throw new Error("OpenAI 응답이 비어 있습니다.");

    return normalizeResult(JSON.parse(outputText), payload.properties);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`OpenAI 응답 시간이 ${config.timeoutMs}ms를 초과했습니다.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function publicError(error) {
  return String(error?.message || error || "AI 브리핑 생성 중 오류가 발생했습니다.").replace(/sk-[A-Za-z0-9_-]+/g, "sk-***");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const body = await readJson(req);
    const payload = buildPayload(body);
    const result = await callOpenAi(payload);
    return sendJson(res, 200, result);
  } catch (error) {
    const status = /고객|후보|id/.test(String(error?.message || "")) ? 400 : 500;
    return sendJson(res, status, { error: publicError(error) });
  }
}
