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
- 서버에서 전달된 conditionChecks를 절대 무시하지 않는다.
- conditionChecks에서 passed=false인 필수 조건이 있으면 fitScore를 "높음"으로 표시하지 않는다.
- 필수 조건을 만족하지 못한 매물을 1위로 언급해야 하는 경우에는 "추천"이 아니라 "비교 참고 후보"로 표현한다.
- 없는 정보는 추정하지 말고 "확인 필요"라고 표시한다.
- 매물 순위는 조건 충족 개수와 필수 조건 통과 여부를 우선으로 판단한다.
- fitScore는 반드시 "높음", "보통", "낮음", "확인 필요" 중 하나만 사용한다.
- customerMessage는 중개사가 고객에게 보낼 수 있는 짧은 카톡/문자 초안으로 작성한다.
- checkPoints는 중개사가 상담 전후로 추가 확인해야 할 사항만 넣는다.
`;

const CHECK_NEEDED = "확인 필요";
const CONDITION_LABELS = {
  area: "면적",
  budget: "가격",
  monthlyRent: "월세",
  parking: "주차",
  useType: "용도",
};
const FIT_SCORE_ORDER = {
  높음: 3,
  보통: 2,
  "확인 필요": 1,
  낮음: 0,
};
const USE_TYPE_KEYWORDS = [
  "뷰티샵",
  "미용실",
  "네일",
  "피부",
  "에스테틱",
  "카페",
  "병원",
  "의원",
  "학원",
  "사무실",
  "상가",
  "음식점",
  "주거",
];

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
          "isRecommended",
          "conditionSummary",
          "failedRequiredConditions",
          "reason",
          "weakPoint",
          "talkingPoint",
        ],
        properties: {
          propertyId: { type: "string" },
          rank: { type: "number" },
          title: { type: "string" },
          fitScore: { type: "string", enum: ["높음", "보통", "낮음", "확인 필요"] },
          isRecommended: { type: "boolean" },
          conditionSummary: { type: "string" },
          failedRequiredConditions: { type: "array", items: { type: "string" } },
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

function joinCleanText(values) {
  return values.map((value) => cleanText(value)).join(" ");
}

function parseNumber(value) {
  const match = cleanText(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function parseAreaM2(value) {
  const source = cleanText(value);
  if (!source) return 0;
  const m2 = source.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)\s*(?:㎡|m2|m²|제곱)/i);
  if (m2) return Number(m2[1]);
  const pyeong = source.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)\s*평/);
  if (pyeong) return Math.round(Number(pyeong[1]) * 3.3058 * 10) / 10;
  return 0;
}

function parseMoneyManwon(value) {
  const source = cleanText(value).replace(/,/g, "");
  if (!source || /확인|미입력|문의/.test(source)) return 0;

  let total = 0;
  const eok = source.match(/([0-9]+(?:\.[0-9]+)?)\s*억/);
  if (eok) total += Number(eok[1]) * 10000;

  const manwonMatches = [...source.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*(?:만|만원)/g)];
  if (manwonMatches.length) {
    const manwon = Number(manwonMatches[manwonMatches.length - 1][1]);
    if (eok) {
      const afterEok = source.slice(source.indexOf(eok[0]) + eok[0].length);
      if (afterEok.includes(manwonMatches[manwonMatches.length - 1][0])) total += manwon;
    } else {
      total = manwon;
    }
  }

  return total || parseNumber(source);
}

function extractMoneyAfter(source, labels) {
  const textValue = cleanText(source).replace(/,/g, "");
  for (const label of labels) {
    const match = textValue.match(new RegExp(`${label}[^0-9]{0,8}([0-9]+(?:\\.[0-9]+)?\\s*(?:억|만원|만)?)`));
    if (match) return parseMoneyManwon(match[1]);
  }
  return 0;
}

function formatMoney(value) {
  return value ? `${Number(value).toLocaleString("ko-KR")}만원` : CHECK_NEEDED;
}

function statusFromText(value) {
  const source = cleanText(value);
  if (!source || /확인|미입력|문의|협의|불명확/.test(source)) return null;
  if (/불가|없음|없습니다|안됨|무/.test(source)) return false;
  if (/가능|있음|있습니다|완비|O|o|제공/.test(source)) return true;
  return null;
}

function extractDesiredUseType(customer) {
  const source = joinCleanText([customer.useType, customer.memo, customer.propertyType]);
  const direct = USE_TYPE_KEYWORDS.find((keyword) => source.includes(keyword));
  if (direct) return direct;
  const beforeUse = source.match(/([가-힣A-Za-z0-9]{2,12})\s*용도/);
  return beforeUse ? beforeUse[1] : "";
}

function extractActualUseTypes(property) {
  const source = joinCleanText([property.useType, property.memo, property.title]);
  return USE_TYPE_KEYWORDS.filter((keyword) => source.includes(keyword));
}

function buildCondition(required, actual, passed, message) {
  return { required, actual: actual || CHECK_NEEDED, passed, message };
}

function getCustomerRequirements(customer) {
  const source = [
    customer.minArea,
    customer.budget,
    customer.deposit,
    customer.monthlyRent,
    customer.memo,
    customer.parkingRequired ? "주차 필요" : "",
  ]
    .map((value) => cleanText(value))
    .join(" ");
  const minArea = parseAreaM2(customer.minArea) || parseAreaM2(source);
  const maxDeposit =
    parseMoneyManwon(customer.deposit) ||
    extractMoneyAfter(source, ["보증금", "보증", "예산", "금액", "가격"]);
  const maxMonthlyRent = parseMoneyManwon(customer.monthlyRent) || extractMoneyAfter(source, ["월세", "월차임", "임대료"]);
  const parkingRequired = Boolean(customer.parkingRequired) || source.includes("주차");
  const useType = extractDesiredUseType(customer);

  return {
    minArea,
    maxDeposit,
    maxMonthlyRent,
    parkingRequired,
    useType,
  };
}

function getPropertyActuals(property) {
  const combinedPrice = joinCleanText([property.deposit, property.monthlyRent, property.price, property.memo]);
  const area = parseAreaM2(property.area);
  const budgetPrice =
    parseMoneyManwon(property.deposit) ||
    extractMoneyAfter(property.price, ["보증금", "전세", "매매"]) ||
    parseMoneyManwon(property.price) ||
    extractMoneyAfter(property.memo, ["보증금", "전세", "매매"]);
  const monthlyRent = parseMoneyManwon(property.monthlyRent) || extractMoneyAfter(combinedPrice, ["월세", "월차임", "임대료"]);
  const parking = statusFromText(property.parking);
  const actualUseTypes = extractActualUseTypes(property);

  return {
    area,
    areaLabel: area ? `${area}㎡` : cleanText(property.area) || CHECK_NEEDED,
    budgetPrice,
    budgetLabel: budgetPrice ? formatMoney(budgetPrice) : cleanText(property.price) || CHECK_NEEDED,
    monthlyRent,
    monthlyRentLabel: monthlyRent ? formatMoney(monthlyRent) : CHECK_NEEDED,
    parking,
    parkingLabel: parking === true ? "가능" : parking === false ? "불가" : CHECK_NEEDED,
    actualUseTypes,
    useTypeLabel: actualUseTypes.join(", ") || CHECK_NEEDED,
  };
}

function buildConditionChecks(customer, property) {
  const requirements = getCustomerRequirements(customer);
  const actuals = getPropertyActuals(property);
  const checks = {
    area: buildCondition(
      requirements.minArea ? `${requirements.minArea}㎡ 이상` : "미입력",
      actuals.areaLabel,
      requirements.minArea ? (actuals.area ? actuals.area >= requirements.minArea : null) : null,
      !requirements.minArea
        ? "고객 최소 면적 조건 확인 필요"
        : !actuals.area
          ? "면적 정보 확인 필요"
          : actuals.area >= requirements.minArea
            ? "최소 면적 조건 충족"
            : "최소 면적 조건 미달",
    ),
    budget: buildCondition(
      requirements.maxDeposit ? `보증금 ${formatMoney(requirements.maxDeposit)} 이하` : "미입력",
      actuals.budgetLabel,
      requirements.maxDeposit ? (actuals.budgetPrice ? actuals.budgetPrice <= requirements.maxDeposit : null) : null,
      !requirements.maxDeposit
        ? "고객 예산 확인 필요"
        : !actuals.budgetPrice
          ? "가격 정보 확인 필요"
          : actuals.budgetPrice <= requirements.maxDeposit
            ? "예산 조건 충족"
            : "예산 조건 초과",
    ),
    monthlyRent: buildCondition(
      requirements.maxMonthlyRent ? `월세 ${formatMoney(requirements.maxMonthlyRent)} 이하` : "미입력",
      actuals.monthlyRentLabel,
      requirements.maxMonthlyRent ? (actuals.monthlyRent ? actuals.monthlyRent <= requirements.maxMonthlyRent : null) : null,
      !requirements.maxMonthlyRent
        ? "고객 월세 조건 확인 필요"
        : !actuals.monthlyRent
          ? "월세 정보 확인 필요"
          : actuals.monthlyRent <= requirements.maxMonthlyRent
            ? "월세 조건 충족"
            : "월세 조건 초과",
    ),
    parking: buildCondition(
      requirements.parkingRequired ? "주차 필요" : "미입력",
      actuals.parkingLabel,
      requirements.parkingRequired ? actuals.parking : null,
      !requirements.parkingRequired
        ? "고객 주차 조건 확인 필요"
        : actuals.parking === true
          ? "주차 조건 충족"
          : actuals.parking === false
            ? "주차 필수 조건 미달"
            : "주차 가능 여부 확인 필요",
    ),
    useType: buildCondition(
      requirements.useType ? `${requirements.useType} 용도` : "미입력",
      actuals.useTypeLabel,
      requirements.useType
        ? actuals.actualUseTypes.length
          ? actuals.actualUseTypes.includes(requirements.useType)
          : null
        : null,
      !requirements.useType
        ? "고객 희망 용도 확인 필요"
        : actuals.actualUseTypes.length
          ? actuals.actualUseTypes.includes(requirements.useType)
            ? "희망 용도와 일치"
            : `${requirements.useType} 용도와 명확히 다를 수 있음`
          : `${requirements.useType} 용도 가능 여부 확인 필요`,
    ),
  };

  return { checks, requirements, actuals };
}

function getRequiredCheckKeys(customer) {
  const requirements = getCustomerRequirements(customer);
  return [
    requirements.minArea ? "area" : "",
    requirements.maxDeposit ? "budget" : "",
    requirements.maxMonthlyRent ? "monthlyRent" : "",
    requirements.parkingRequired ? "parking" : "",
    requirements.useType ? "useType" : "",
  ].filter(Boolean);
}

function summarizeConditionChecks(conditionChecks, requiredKeys) {
  const failed = requiredKeys.filter((key) => conditionChecks[key]?.passed === false);
  const unknown = requiredKeys.filter((key) => conditionChecks[key]?.passed === null);
  const passed = requiredKeys.filter((key) => conditionChecks[key]?.passed === true);
  const parts = [];
  if (passed.length) parts.push(`충족: ${passed.map((key) => CONDITION_LABELS[key]).join(", ")}`);
  if (failed.length) parts.push(`미충족: ${failed.map((key) => CONDITION_LABELS[key]).join(", ")}`);
  if (unknown.length) parts.push(`확인 필요: ${unknown.map((key) => CONDITION_LABELS[key]).join(", ")}`);
  return parts.join(" / ") || "필수 조건 확인 필요";
}

function deriveServerFitScore(conditionChecks, requiredKeys) {
  const failed = requiredKeys.filter((key) => conditionChecks[key]?.passed === false);
  const unknown = requiredKeys.filter((key) => conditionChecks[key]?.passed === null);
  if (failed.length >= 2) return "낮음";
  if (failed.length === 1) return "보통";
  if (unknown.length) return "확인 필요";
  return "높음";
}

function getFailedRequiredConditions(conditionChecks, requiredKeys) {
  return requiredKeys
    .filter((key) => conditionChecks[key]?.passed === false)
    .map((key) => CONDITION_LABELS[key]);
}

function getUnknownRequiredConditions(conditionChecks, requiredKeys) {
  return requiredKeys
    .filter((key) => conditionChecks[key]?.passed === null)
    .map((key) => CONDITION_LABELS[key]);
}

function enrichPropertiesWithConditionChecks(customer, properties) {
  const requiredKeys = getRequiredCheckKeys(customer);
  return properties
    .map((property) => {
      const { checks } = buildConditionChecks(customer, property);
      const failedRequiredConditions = getFailedRequiredConditions(checks, requiredKeys);
      const unknownRequiredConditions = getUnknownRequiredConditions(checks, requiredKeys);
      const serverFitScore = deriveServerFitScore(checks, requiredKeys);
      const isRecommended = failedRequiredConditions.length === 0 && unknownRequiredConditions.length === 0;
      return {
        ...property,
        conditionChecks: checks,
        conditionSummary: summarizeConditionChecks(checks, requiredKeys),
        failedRequiredConditions,
        unknownRequiredConditions,
        serverFitScore,
        isRecommended,
        _conditionSort: {
          failed: failedRequiredConditions.length,
          unknown: unknownRequiredConditions.length,
          score: FIT_SCORE_ORDER[serverFitScore] ?? 0,
        },
      };
    })
    .sort((a, b) => {
      if (a._conditionSort.failed !== b._conditionSort.failed) return a._conditionSort.failed - b._conditionSort.failed;
      if (a._conditionSort.unknown !== b._conditionSort.unknown) return a._conditionSort.unknown - b._conditionSort.unknown;
      return b._conditionSort.score - a._conditionSort.score;
    })
    .map((property, index) => ({
      ...property,
      serverRank: index + 1,
      _conditionSort: undefined,
    }));
}

function cleanCustomer(customer = {}) {
  const memo = cleanText(customer.memo, 700);
  const requiredConditionsText = Array.isArray(customer.requiredConditions)
    ? customer.requiredConditions.join(" ")
    : customer.requiredConditions;
  const parkingSource = joinCleanText([customer.parkingRequired, requiredConditionsText, memo]);
  const parkingRequired =
    customer.parkingRequired === true || String(customer.parkingRequired).toLowerCase() === "true" || parkingSource.includes("주차");

  return {
    name: cleanText(customer.name, 120),
    desiredRegion: cleanText(customer.desiredRegion, 180),
    budget: cleanText(customer.budget, 180),
    deposit: cleanText(customer.deposit, 120),
    monthlyRent: cleanText(customer.monthlyRent, 120),
    propertyType: cleanText(customer.propertyType, 160),
    minArea: cleanText(customer.minArea, 120),
    parkingRequired,
    useType: cleanText(customer.useType, 120),
    memo,
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
    useType: cleanText(property.useType, 120),
    memo: cleanText(property.memo, 700),
  };
}

export function buildPayload(body) {
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

  const checkedProperties = enrichPropertiesWithConditionChecks(customer, properties.slice(0, 8));

  return {
    customer,
    properties: checkedProperties,
    criteria,
    conditionGuidance: {
      requiredPriority: "conditionChecks의 passed=false는 필수 조건 미충족입니다. fitScore와 순위 판단에서 가장 먼저 반영하세요.",
      fitScoreRules: [
        "면적 필수 조건이 미달이면 fitScore 높음 금지",
        "예산이 명확히 초과하면 fitScore 높음 금지",
        "용도 불일치가 명확하면 fitScore 높음 금지",
        "필수 조건 2개 이상 미달이면 fitScore 낮음",
        "정보 부족은 확인 필요로 표시",
      ],
    },
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

export function normalizeResult(result, properties) {
  const propertyById = new Map(properties.map((property) => [String(property.id), property]));
  const propertyIds = new Set(propertyById.keys());
  const ranking = Array.isArray(result.ranking)
    ? result.ranking
        .filter((item) => propertyIds.has(String(item.propertyId)))
        .map((item, index) => {
          const property = propertyById.get(String(item.propertyId));
          const failedRequiredConditions = property.failedRequiredConditions || [];
          const conditionChecks = property.conditionChecks || {};
          const serverFitScore = property.serverFitScore || "확인 필요";
          return {
            propertyId: String(item.propertyId || ""),
            rank: Number(property.serverRank || item.rank || index + 1),
            title: cleanText(item.title || property.title, 180),
            fitScore: serverFitScore,
            isRecommended: Boolean(property.isRecommended),
            conditionSummary: cleanText(property.conditionSummary || item.conditionSummary, 700),
            failedRequiredConditions,
            conditionChecks,
            reason: cleanText(item.reason, 700),
            weakPoint: cleanText(item.weakPoint, 700),
            talkingPoint: cleanText(item.talkingPoint, 700),
          };
        })
        .sort((a, b) => a.rank - b.rank)
    : [];

  if (!ranking.length) {
    throw new Error("AI 응답에 유효한 추천 순위가 없습니다.");
  }

  const hasRecommendedProperties = ranking.some((item) => item.isRecommended);
  const conditionNotice = hasRecommendedProperties
    ? ""
    : "조건에 완전히 맞는 매물이 없습니다. 고객 조건 조정 또는 추가 매물 확인이 필요합니다.";

  return {
    customerSummary: cleanText(result.customerSummary, 900),
    recommendationSummary: hasRecommendedProperties
      ? cleanText(result.recommendationSummary, 900)
      : `${conditionNotice} ${cleanText(result.recommendationSummary, 700)}`.trim(),
    hasRecommendedProperties,
    conditionNotice,
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
