export const AI_BRIEFING_FOCUS_OPTIONS = [
  { id: "price", label: "가격" },
  { id: "location", label: "위치" },
  { id: "size", label: "면적" },
  { id: "parking", label: "주차" },
  { id: "elevator", label: "엘리베이터" },
  { id: "purpose", label: "업종/용도" },
  { id: "move_in", label: "입주 가능일" },
];

const EMPTY = "미입력";
const CHECK = "확인 필요";
const NEGATIVE_WORDS = ["불가", "없음", "없습니다", "안됨", "무"];
const POSITIVE_WORDS = ["가능", "있음", "있습니다", "완비", "제공"];

function text(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "";
  return String(value).trim();
}

function truncate(value, max = 500) {
  const source = text(value).replace(/\s+/g, " ");
  return source.length > max ? `${source.slice(0, max).trim()}...` : source;
}

function truncateList(items, maxItems, maxChars) {
  return unique(items).slice(0, maxItems).map((item) => truncate(item, maxChars));
}

function unique(items) {
  return [...new Set((items || []).map(text).filter(Boolean))];
}

function compact(value, fallback = EMPTY) {
  return text(value) || fallback;
}

function getNested(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
  }
  return "";
}

export function getPropertyId(property = {}) {
  return text(property.id || property.property_id || property.uuid || property.data?.id);
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = text(value);
  if (!raw) return 0;
  const match = raw.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function amountToManwon(value) {
  const raw = text(value);
  const number = toNumber(raw);
  if (!number) return 0;
  if (raw.includes("억")) return number * 10000;
  return number;
}

function parseBudgetFromText(value = "") {
  const source = text(value);
  const sale = source.match(/(?:매매|전세|예산|금액|가격)\s*([0-9,.]+)\s*(억|만원)?/);
  const deposit = source.match(/(?:보증금|보증)\s*([0-9,.]+)\s*(억|만원)?/);
  const monthly = source.match(/(?:월세|월차임|임대료)\s*([0-9,.]+)\s*(만원)?/);
  return {
    maxPrice: amountToManwon([sale?.[1], sale?.[2]].filter(Boolean).join(" ")),
    maxDeposit: amountToManwon([deposit?.[1], deposit?.[2]].filter(Boolean).join(" ")),
    maxMonthlyRent: amountToManwon(monthly?.[1]),
  };
}

function parseAreaM2(value = "") {
  const source = text(value);
  const m2 = source.match(/([0-9,.]+)\s*(?:m2|㎡|제곱|평방)/i);
  const pyeong = source.match(/([0-9,.]+)\s*평/);
  if (m2) return toNumber(m2[1]);
  if (pyeong) return Math.round(toNumber(pyeong[1]) * 3.3058 * 10) / 10;
  return 0;
}

function splitKeywords(value = "") {
  return unique(
    text(value)
      .split(/[,\n/| ]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2),
  ).slice(0, 8);
}

function booleanFromText(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const source = text(value);
  if (!source) return null;
  if (/^[0-9]+(\.[0-9]+)?$/.test(source)) return Number(source) > 0;
  if (NEGATIVE_WORDS.some((word) => source.includes(word))) return false;
  if (POSITIVE_WORDS.some((word) => source.includes(word))) return true;
  return null;
}

function availabilityStatus(value) {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return value > 0 ? "yes" : "no";
  const source = text(value);
  if (!source) return "unknown";
  if (/협의|미정|확인|문의/.test(source)) return "unknown";
  if (/^[0-9]+(\.[0-9]+)?$/.test(source)) return Number(source) > 0 ? "yes" : "no";
  if (NEGATIVE_WORDS.some((word) => source.includes(word))) return "no";
  if (POSITIVE_WORDS.some((word) => source.includes(word))) return "yes";
  return "unknown";
}

export function formatAvailability(value) {
  const parsed = booleanFromText(value);
  if (parsed === true) return "O";
  if (parsed === false) return "X";
  return CHECK;
}

function includesAny(source, tokens) {
  const haystack = text(source).toLowerCase();
  return (tokens || []).some((token) => haystack.includes(text(token).toLowerCase()));
}

function inferDealType(...values) {
  const source = values.map(text).join(" ");
  if (source.includes("월세")) return "월세";
  if (source.includes("전세")) return "전세";
  if (source.includes("매매")) return "매매";
  return "";
}

function inferRequiredConditions(customer = {}) {
  const source = [
    customer.wanted_condition,
    customer.requirement,
    customer.memo,
    customer.notes,
    customer.important_notes,
  ].map(text).join(" ");

  const items = [];
  if (/주차\s*(필수|필요)|주차가능|주차 가능/.test(source)) items.push("주차");
  if (/엘리베이터|엘베/.test(source)) items.push("엘리베이터");
  if (/역세권|지하철|도보/.test(source)) items.push("교통");
  if (/즉시|입주/.test(source)) items.push("입주 가능일");
  return unique(items);
}

export function normalizeBriefingCustomer(customer = {}) {
  const memoText = [
    customer.wanted_condition,
    customer.requirement,
    customer.memo,
    customer.notes,
    customer.important_notes,
  ].map(text).filter(Boolean).join(" ");
  const inferredBudget = parseBudgetFromText(memoText);
  const preferredArea = getNested(customer, ["preferred_area", "area", "location", "preferred_locations"]);
  const minArea = toNumber(customer.min_area_m2) || parseAreaM2(memoText);

  return {
    id: text(customer.id),
    displayName: compact(customer.name, "고객"),
    purpose: compact(customer.property_type || customer.customer_type || customer.purpose, ""),
    dealType: customer.preferred_deal_type || inferDealType(memoText, customer.property_type),
    budget: {
      maxPrice: amountToManwon(customer.max_price) || inferredBudget.maxPrice,
      maxDeposit: amountToManwon(customer.max_deposit) || inferredBudget.maxDeposit,
      maxMonthlyRent: amountToManwon(customer.max_monthly_rent) || inferredBudget.maxMonthlyRent,
    },
    preferredAreas: splitKeywords(preferredArea),
    minSizeM2: minArea,
    requiredConditions: inferRequiredConditions(customer),
    parkingRequired: inferRequiredConditions(customer).includes("주차") || customer.parking_required === true,
    elevatorRequired: inferRequiredConditions(customer).includes("엘리베이터") || customer.elevator_required === true,
    moveInDeadline: text(customer.move_in_deadline),
    importantMemo: truncate(memoText, 500),
    raw: customer,
  };
}

export function normalizeBriefingProperty(property = {}) {
  const data = property.data && typeof property.data === "object" ? property.data : {};
  const form = data.form || property.form || data || {};
  const priceObject = property.price && typeof property.price === "object" ? property.price : {};
  const mergedMemo = [
    property.description,
    property.memo,
    property.note,
    property.tags,
    property.price_summary,
    form.description,
    form.special_notes,
    form.recommended_use,
    form.options,
  ].map(text).filter(Boolean).join(" ");
  const dealType = getNested(property, ["deal_type", "dealType"]) || form.deal_type || inferDealType(mergedMemo, property.title, property.displayName);
  const deposit = amountToManwon(property.deposit ?? form.deposit ?? priceObject.deposit);
  const monthlyRent = amountToManwon(property.monthly_rent ?? form.monthly_rent ?? priceObject.monthlyRent ?? priceObject.monthly_rent);
  const salePrice = amountToManwon(property.sale_price ?? form.sale_price ?? form.price ?? priceObject.salePrice ?? priceObject.sale_price ?? (typeof property.price === "string" ? property.price : ""));
  const areaM2 =
    toNumber(property.sizeM2) ||
    toNumber(property.area_m2) ||
    parseAreaM2(property.area || property.size || "") ||
    parseAreaM2(`${form.exclusive_area || ""}${form.exclusive_area_unit || ""}`) ||
    parseAreaM2(`${form.supply_area || ""}${form.supply_area_unit || ""}`) ||
    parseAreaM2(mergedMemo);

  return {
    id: getPropertyId(property),
    displayName: compact(property.displayName || property.title || form.title, "매물명 미입력"),
    addressOrArea: compact(property.addressOrArea || property.address || form.address || property.location || form.location || property.dong || form.dong, ""),
    dealType,
    price: {
      salePrice,
      deposit,
      monthlyRent,
      summary: compact(property.price_summary || priceObject.summary || (typeof property.price === "string" ? property.price : "") || form.price_summary || "", ""),
    },
    sizeM2: areaM2,
    sizeLabel: compact(property.sizeLabel || property.size || property.area || form.exclusive_area || form.supply_area || "", ""),
    floor: compact(property.floor || form.floor, ""),
    parking: property.parking ?? form.parking ?? form.parking_count ?? "",
    elevator: property.elevator ?? form.elevator ?? "",
    transport: compact(property.transport || form.transport || form.subway || "", ""),
    brokerMemo: truncate(property.brokerMemo || mergedMemo, 500),
    moveInDate: text(property.move_in_date || form.move_in_date),
    raw: property,
  };
}

function formatMoney(value) {
  return value ? `${Number(value).toLocaleString("ko-KR")}만원` : "";
}

export function formatCustomerBudget(customer) {
  const budget = customer?.budget || {};
  return [
    budget.maxPrice ? `금액 ${formatMoney(budget.maxPrice)} 이하` : "",
    budget.maxDeposit ? `보증금 ${formatMoney(budget.maxDeposit)} 이하` : "",
    budget.maxMonthlyRent ? `월세 ${formatMoney(budget.maxMonthlyRent)} 이하` : "",
  ].filter(Boolean).join(" / ") || EMPTY;
}

export function formatPropertyPrice(property) {
  const price = property?.price || {};
  if (price.summary) return price.summary;
  if (property?.dealType === "월세") {
    return [price.deposit ? `보증금 ${formatMoney(price.deposit)}` : "", price.monthlyRent ? `월세 ${formatMoney(price.monthlyRent)}` : ""]
      .filter(Boolean)
      .join(" / ") || CHECK;
  }
  return price.salePrice || price.deposit ? formatMoney(price.salePrice || price.deposit) : CHECK;
}

function scoreBudget(customer, property, matched, concerns, missingChecks) {
  const budget = customer.budget || {};
  const isMonthly = property.dealType === "월세" || property.price.monthlyRent;
  const targetPrice = isMonthly ? property.price.deposit : property.price.salePrice || property.price.deposit;
  const maxPrice = isMonthly ? budget.maxDeposit || budget.maxPrice : budget.maxPrice || budget.maxDeposit;
  const monthlyOk = !isMonthly || !budget.maxMonthlyRent || !property.price.monthlyRent || property.price.monthlyRent <= budget.maxMonthlyRent;

  if (!targetPrice && !property.price.monthlyRent) {
    missingChecks.push("매물 가격 정보 확인 필요");
    return 14;
  }
  if (!maxPrice && !budget.maxMonthlyRent) {
    missingChecks.push("고객 예산 확인 필요");
    return 16;
  }

  const ratio = maxPrice && targetPrice ? targetPrice / maxPrice : 1;
  if (ratio <= 1 && monthlyOk) {
    matched.push("예산 범위 안에서 검토 가능합니다.");
    return 30;
  }
  if (ratio <= 1.1 && monthlyOk) {
    concerns.push("예산을 약간 초과할 수 있어 조정 여지를 확인해야 합니다.");
    return 22;
  }
  if (ratio <= 1.25) {
    concerns.push("고객 예산보다 높은 편입니다.");
    return 12;
  }
  concerns.push("예산 적합도가 낮습니다.");
  return 4;
}

function getBudgetOverrunRatio(customer, property) {
  const budget = customer.budget || {};
  const isMonthly = property.dealType === "월세" || property.price.monthlyRent;
  const targetPrice = isMonthly ? property.price.deposit : property.price.salePrice || property.price.deposit;
  const maxPrice = isMonthly ? budget.maxDeposit || budget.maxPrice : budget.maxPrice || budget.maxDeposit;
  const rentRatio = isMonthly && budget.maxMonthlyRent && property.price.monthlyRent ? property.price.monthlyRent / budget.maxMonthlyRent : 1;
  const priceRatio = maxPrice && targetPrice ? targetPrice / maxPrice : 1;
  return Math.max(priceRatio, rentRatio);
}

function scoreLocation(customer, property, matched, concerns, missingChecks) {
  const locationText = [property.addressOrArea, property.transport, property.brokerMemo].join(" ");
  if (!locationText.trim()) {
    missingChecks.push("매물 주소/지역 정보 확인 필요");
    return 8;
  }
  if (!customer.preferredAreas.length) {
    missingChecks.push("고객 희망 지역 확인 필요");
    return 12;
  }
  if (customer.preferredAreas.some((area) => includesAny(locationText, [area]))) {
    matched.push("희망 지역과 매물 위치가 맞닿아 있습니다.");
    return 20;
  }
  concerns.push("희망 지역과의 거리감은 지도에서 추가 확인이 필요합니다.");
  return 8;
}

function scoreSize(customer, property, matched, concerns, missingChecks) {
  if (!customer.minSizeM2) {
    missingChecks.push("고객 최소 면적 확인 필요");
    return 9;
  }
  if (!property.sizeM2) {
    missingChecks.push("매물 면적 정보 확인 필요");
    return 8;
  }
  const ratio = property.sizeM2 / customer.minSizeM2;
  if (ratio >= 1) {
    matched.push("고객이 원하는 최소 면적 조건을 충족합니다.");
    return 15;
  }
  concerns.push("고객이 원하는 면적보다 작을 수 있습니다.");
  return Math.max(2, Math.round(15 * ratio));
}

function scoreRequirements(customer, property, matched, concerns, missingChecks) {
  let score = 12;
  const parking = booleanFromText(property.parking);
  const elevator = booleanFromText(property.elevator);

  if (customer.parkingRequired) {
    if (parking === true) {
      score += 4;
      matched.push("주차 조건 확인 가능성이 높습니다.");
    } else if (parking === false) {
      score -= 8;
      concerns.push("주차 필수 조건과 맞지 않을 수 있습니다.");
    } else {
      score -= 2;
      missingChecks.push("주차 가능 여부 확인 필요");
    }
  }

  if (customer.elevatorRequired) {
    if (elevator === true) {
      score += 4;
      matched.push("엘리베이터 조건을 충족할 가능성이 있습니다.");
    } else if (elevator === false) {
      score -= 6;
      concerns.push("엘리베이터 조건과 맞지 않을 수 있습니다.");
    } else {
      score -= 2;
      missingChecks.push("엘리베이터 여부 확인 필요");
    }
  }

  if (customer.purpose && includesAny([property.brokerMemo, property.displayName].join(" "), [customer.purpose])) {
    score += 2;
    matched.push("고객 용도와 매물 설명의 방향이 맞습니다.");
  } else if (customer.purpose) {
    missingChecks.push("업종/용도 가능 여부 확인 필요");
  }

  if (customer.moveInDeadline && !property.moveInDate) missingChecks.push("입주 가능일 확인 필요");

  return Math.max(0, Math.min(20, score));
}

function scoreMemo(customer, property, matched) {
  if (!customer.importantMemo) return 5;
  const tokens = splitKeywords(customer.importantMemo).slice(0, 8);
  const hits = tokens.filter((token) => includesAny([property.displayName, property.addressOrArea, property.brokerMemo].join(" "), [token]));
  if (hits.length) {
    matched.push(`상담 메모 키워드(${hits.slice(0, 2).join(", ")})와 맞는 부분이 있습니다.`);
    return Math.min(10, 5 + hits.length * 2);
  }
  return 4;
}

function scoreRisk(property, missingChecks) {
  let score = 5;
  if (!property.addressOrArea) {
    missingChecks.push("주소 불명확");
    score -= 1;
  }
  if (!formatPropertyPrice(property) || formatPropertyPrice(property) === CHECK) {
    missingChecks.push("가격 불명확");
    score -= 1;
  }
  if (!property.sizeM2 && !property.sizeLabel) {
    missingChecks.push("면적 불명확");
    score -= 1;
  }
  if (booleanFromText(property.parking) === null) {
    missingChecks.push("주차 정보 불명확");
    score -= 1;
  }
  if (!property.moveInDate) {
    missingChecks.push("입주 가능일 불명확");
    score -= 1;
  }
  return Math.max(0, score);
}

function calculateInfoCompleteness(property) {
  const checks = [
    Boolean(formatPropertyPrice(property) && formatPropertyPrice(property) !== CHECK),
    Boolean(property.sizeM2 || property.sizeLabel),
    Boolean(property.addressOrArea),
    availabilityStatus(property.parking) !== "unknown",
    availabilityStatus(property.elevator) !== "unknown",
    Boolean(property.raw?.maintenance_fee || property.raw?.data?.form?.maintenance_fee),
    Boolean(property.moveInDate),
    Boolean(property.brokerMemo),
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

function applyScoreCaps(score, customer, property, concerns, missingChecks) {
  const capsApplied = [];
  let cappedScore = score;
  const addCap = (maxScore, reason) => {
    if (cappedScore > maxScore) cappedScore = maxScore;
    capsApplied.push(reason);
  };

  if (customer.dealType && property.dealType && customer.dealType !== property.dealType) {
    addCap(40, "거래 유형 불일치로 40점 상한");
    concerns.push("희망 거래 유형과 명확히 다릅니다.");
  }

  const parking = availabilityStatus(property.parking);
  if (customer.parkingRequired) {
    if (parking === "no") {
      addCap(60, "주차 필수 조건 불일치로 60점 상한");
      concerns.push("주차 필수 조건과 맞지 않습니다.");
    } else if (parking === "unknown") {
      addCap(80, "주차 필수 조건 확인 필요로 80점 상한");
      missingChecks.push("주차 가능 여부 확인 필요");
    }
  }

  const elevator = availabilityStatus(property.elevator);
  if (customer.elevatorRequired && elevator === "no") {
    addCap(65, "엘리베이터 필수 조건 불일치로 65점 상한");
    concerns.push("엘리베이터 필수 조건과 맞지 않습니다.");
  }

  const budgetRatio = getBudgetOverrunRatio(customer, property);
  if (budgetRatio >= 1.4) {
    addCap(50, "예산 40% 이상 초과로 50점 상한");
  } else if (budgetRatio >= 1.2) {
    addCap(65, "예산 20% 이상 초과로 65점 상한");
  }

  if (customer.minSizeM2 && property.sizeM2 && property.sizeM2 / customer.minSizeM2 <= 0.8) {
    addCap(65, "최소 면적 20% 이상 부족으로 65점 상한");
  }

  const missingCore = [
    !property.addressOrArea && "주소/지역 정보 부족",
    formatPropertyPrice(property) === CHECK && "가격 정보 부족",
    !property.sizeM2 && !property.sizeLabel && "면적 정보 부족",
  ].filter(Boolean);
  if (missingCore.length >= 2) {
    addCap(65, "핵심 정보 2개 이상 부족으로 65점 상한");
  } else if (missingCore.length === 1) {
    addCap(75, "핵심 정보 부족으로 75점 상한");
  }
  missingCore.forEach((item) => missingChecks.push(item));

  return { score: Math.max(0, Math.min(100, cappedScore)), capsApplied: unique(capsApplied) };
}

export function calculatePropertyFitScore(customerInput, propertyInput, options = {}) {
  const customer = customerInput?.budget ? customerInput : normalizeBriefingCustomer(customerInput);
  const property = propertyInput?.price ? propertyInput : normalizeBriefingProperty(propertyInput);
  const matched = [];
  const concerns = [];
  const missingChecks = [];

  const rawBreakdown = {
    budget: scoreBudget(customer, property, matched, concerns, missingChecks),
    location: scoreLocation(customer, property, matched, concerns, missingChecks),
    size: scoreSize(customer, property, matched, concerns, missingChecks),
    requirements: scoreRequirements(customer, property, matched, concerns, missingChecks),
    memo: scoreMemo(customer, property, matched),
    risk: scoreRisk(property, missingChecks),
  };

  const focus = new Set(options.focus || []);
  if (focus.has("price")) rawBreakdown.budget = Math.min(30, rawBreakdown.budget + 2);
  if (focus.has("location")) rawBreakdown.location = Math.min(20, rawBreakdown.location + 2);
  if (focus.has("size")) rawBreakdown.size = Math.min(15, rawBreakdown.size + 1);
  if (focus.has("parking") && customer.parkingRequired) rawBreakdown.requirements = Math.min(20, rawBreakdown.requirements + 1);
  if (focus.has("elevator") && customer.elevatorRequired) rawBreakdown.requirements = Math.min(20, rawBreakdown.requirements + 1);

  const baseScore = Math.max(0, Math.min(100, Math.round(Object.values(rawBreakdown).reduce((sum, value) => sum + value, 0))));
  const capped = applyScoreCaps(baseScore, customer, property, concerns, missingChecks);
  const score = capped.score;
  const grade = score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 55 ? "fair" : "risky";
  const infoCompleteness = calculateInfoCompleteness(property);

  return {
    propertyId: property.id,
    score,
    infoCompleteness,
    grade,
    matched: unique(matched).slice(0, 6),
    concerns: unique(concerns).slice(0, 6),
    missingChecks: unique(missingChecks).slice(0, 8),
    capsApplied: capped.capsApplied,
    rawBreakdown,
    normalizedProperty: property,
  };
}

function gradeLabel(grade) {
  return {
    excellent: "우선 추천",
    good: "검토 추천",
    fair: "조건 일부 불일치",
    risky: "추천 주의",
  }[grade] || "검토";
}

function buildRankingCopy(scored, property) {
  const strengths = scored.matched.length ? scored.matched.slice(0, 3) : ["고객 조건과 비교해 검토 가능한 매물입니다."];
  const concerns = scored.concerns.length ? scored.concerns.slice(0, 3) : scored.missingChecks.slice(0, 2);
  return {
    propertyId: scored.propertyId,
    rank: scored.rank,
    score: scored.score,
    infoCompleteness: scored.infoCompleteness,
    grade: scored.grade,
    gradeLabel: gradeLabel(scored.grade),
    displayName: property.displayName,
    shortReason: `${gradeLabel(scored.grade)}: ${strengths[0]}`,
    strengths,
    concerns: concerns.length ? concerns : ["특별한 주의점은 크지 않지만 현장 확인은 필요합니다."],
    missingChecks: scored.missingChecks || [],
    capsApplied: scored.capsApplied || [],
    talkingPoints: [
      `${property.displayName}은 ${formatPropertyPrice(property)} 조건으로 정리됩니다.`,
      property.addressOrArea ? `위치는 ${property.addressOrArea} 기준으로 안내하면 좋습니다.` : "주소/위치 정보는 상담 전 확인이 필요합니다.",
      scored.missingChecks[0] ? `${scored.missingChecks[0]} 항목은 먼저 확인해 주세요.` : "고객 반응을 보고 다음 후보와 비교하면 좋습니다.",
    ].slice(0, 3),
  };
}

export function createRuleBasedBriefing({ customer, properties, focus = [], mode = "rule_based", model = "" }) {
  const normalizedCustomer = normalizeBriefingCustomer(customer);
  const normalizedProperties = (properties || []).map(normalizeBriefingProperty).filter((property) => property.id);
  const scored = normalizedProperties
    .map((property) => calculatePropertyFitScore(normalizedCustomer, property, { focus }))
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const top = scored[0];
  const second = scored[1];
  const propertyById = new Map(normalizedProperties.map((property) => [property.id, property]));
  const rankings = scored.map((item) => buildRankingCopy(item, propertyById.get(item.propertyId)));
  const topProperty = top ? propertyById.get(top.propertyId) : null;
  const secondProperty = second ? propertyById.get(second.propertyId) : null;
  const missingChecks = unique(scored.flatMap((item) => item.missingChecks)).slice(0, 8);
  const topStrength = top?.matched?.[0] || "고객 조건과의 균형";
  const topConcern = top?.concerns?.[0] || top?.missingChecks?.[0] || "현장 확인";

  const summary = topProperty
    ? `${topProperty.displayName}이 ${top.score}점으로 가장 균형이 좋습니다.`
    : "비교할 매물이 부족합니다.";
  const recommendationComment = topProperty
    ? secondProperty
      ? `1순위 ${topProperty.displayName}은 ${topStrength}이 강점이고, 2순위 ${secondProperty.displayName}은 대안으로 비교해볼 만합니다. 다만 ${topConcern}은 확인이 필요합니다.`
      : `${topProperty.displayName}이 현재 조건에서 가장 적합합니다. 다만 ${topConcern}은 상담 전 확인해 주세요.`
    : "고객과 매물을 선택하면 브리핑을 생성할 수 있습니다.";

  const normalMessage = topProperty
    ? `대표님 조건 기준으로는 ${topProperty.displayName}이 가장 먼저 보실 만합니다. ${topStrength} 부분이 장점이고, ${formatPropertyPrice(topProperty)} 조건입니다. 다만 ${topConcern}은 제가 한 번 더 확인해서 안내드리겠습니다.`
    : "조건에 맞는 매물을 정리한 뒤 다시 안내드리겠습니다.";

  return {
    mode,
    model,
    briefing: {
      summary,
      recommendationComment,
      rankings,
      brokerNote: topProperty
        ? `${normalizedCustomer.displayName} 고객에게는 ${topProperty.displayName}을 1순위로 제안한다. 상담에서는 ${topStrength}을 먼저 설명하고, ${topConcern}은 단정하지 말고 확인 후 안내한다.`
        : "고객 조건과 후보 매물을 먼저 선택해야 합니다.",
      customerMessages: {
        short: topProperty ? `조건 기준으로 ${topProperty.displayName}이 가장 좋아 보입니다. ${topConcern}만 확인해서 안내드릴게요.` : "조건에 맞는 매물을 정리해드리겠습니다.",
        normal: normalMessage,
        softPersuasive: topProperty
          ? `대표님, 무리하게 권해드리기보다는 조건에 맞는 후보부터 차분히 비교해보시면 좋겠습니다. 현재는 ${topProperty.displayName}이 ${topStrength} 측면에서 가장 균형이 좋아 보이고, ${topConcern}은 제가 확인해서 보완 안내드리겠습니다.`
          : "조건이 정리되면 부담 없이 비교하실 수 있게 후보를 추려드리겠습니다.",
      },
      brochureCopy: {
        title: topProperty ? `${topProperty.displayName} 고객 맞춤 브리핑` : "고객 맞춤 매물 브리핑",
        summary: topProperty ? `${topStrength}을 중심으로 추천할 수 있는 매물입니다.` : "고객 조건에 맞춰 매물을 비교합니다.",
        bullets: rankings[0]?.strengths?.slice(0, 4) || [],
      },
      missingChecks,
    },
  };
}

export function sanitizeForLlmPayload({ customer, properties, ruleBasedResults }) {
  const normalizedCustomer = normalizeBriefingCustomer(customer);
  const normalizedProperties = (properties || []).map(normalizeBriefingProperty);
  return {
    customer: {
      displayName: normalizedCustomer.displayName,
      purpose: normalizedCustomer.purpose,
      budget: formatCustomerBudget(normalizedCustomer),
      preferredAreas: normalizedCustomer.preferredAreas,
      minSize: normalizedCustomer.minSizeM2 ? `${normalizedCustomer.minSizeM2}㎡ 이상` : "",
      requiredConditions: normalizedCustomer.requiredConditions,
      importantMemo: truncate(normalizedCustomer.importantMemo, 500),
    },
    properties: normalizedProperties.map((property) => ({
      propertyId: property.id,
      displayName: property.displayName,
      addressOrArea: truncate(property.addressOrArea, 120),
      price: formatPropertyPrice(property),
      size: property.sizeM2 ? `${property.sizeM2}㎡` : property.sizeLabel,
      floor: property.floor,
      parking: formatAvailability(property.parking),
      elevator: formatAvailability(property.elevator),
      transport: truncate(property.transport, 160),
      brokerMemo: truncate(property.brokerMemo, 500),
    })),
    ruleBasedResults: (ruleBasedResults || []).map((item) => ({
      propertyId: item.propertyId,
      rank: item.rank,
      matchScore: item.score,
      fitScore: item.score,
      infoCompleteness: item.infoCompleteness,
      grade: item.grade,
      gradeLabel: item.gradeLabel,
      matched: item.matched,
      concerns: item.concerns,
      missingChecks: item.missingChecks,
      capsApplied: item.capsApplied,
    })),
    outputLimits: {
      maxStrengthsPerProperty: 3,
      maxConcernsPerProperty: 3,
      maxTalkingPointsPerProperty: 3,
      maxBrochureBullets: 4,
      maxMissingChecks: 8,
      maxSummaryChars: 90,
      maxRecommendationChars: 260,
      maxShortMessageChars: 250,
      maxNormalMessageChars: 520,
      maxBrokerNoteChars: 650,
    },
  };
}

export function validateAndRepairBriefing(llmBriefing, ruleBriefing, scoredResults) {
  if (!llmBriefing || typeof llmBriefing !== "object") return null;
  const ruleById = new Map((scoredResults || []).map((item) => [item.propertyId, item]));
  const ruleRankingById = new Map((ruleBriefing.rankings || []).map((item) => [item.propertyId, item]));
  const repairedRankings = (llmBriefing.rankings || [])
    .filter((item) => ruleById.has(text(item.propertyId)))
    .map((item) => {
      const rule = ruleById.get(text(item.propertyId));
      const fallback = ruleRankingById.get(text(item.propertyId)) || {};
      return {
        ...fallback,
        ...item,
        propertyId: rule.propertyId,
        rank: rule.rank,
        score: rule.score,
        infoCompleteness: rule.infoCompleteness,
        grade: rule.grade,
        gradeLabel: rule.gradeLabel || fallback.gradeLabel,
        shortReason: truncate(item.shortReason || fallback.shortReason, 90),
        strengths: truncateList(item.strengths, 3, 70),
        concerns: truncateList(item.concerns, 3, 70),
        missingChecks: truncateList(fallback.missingChecks || [], 5, 70),
        capsApplied: truncateList(fallback.capsApplied || [], 4, 90),
        talkingPoints: truncateList(item.talkingPoints, 3, 90),
      };
    })
    .sort((a, b) => a.rank - b.rank);

  if (!text(llmBriefing.summary) || !repairedRankings.length) return null;

  return sanitizeBriefingLanguage({
    summary: truncate(llmBriefing.summary, 90),
    recommendationComment: truncate(llmBriefing.recommendationComment || ruleBriefing.recommendationComment, 260),
    rankings: repairedRankings,
    brokerNote: truncate(llmBriefing.brokerNote || ruleBriefing.brokerNote, 650),
    customerMessages: {
      short: truncate(llmBriefing.customerMessages?.short || ruleBriefing.customerMessages.short, 250),
      normal: truncate(llmBriefing.customerMessages?.normal || ruleBriefing.customerMessages.normal, 520),
      softPersuasive: truncate(llmBriefing.customerMessages?.softPersuasive || ruleBriefing.customerMessages.softPersuasive, 520),
    },
    brochureCopy: {
      title: truncate(llmBriefing.brochureCopy?.title || ruleBriefing.brochureCopy.title, 80),
      summary: truncate(llmBriefing.brochureCopy?.summary || ruleBriefing.brochureCopy.summary, 300),
      bullets: unique(llmBriefing.brochureCopy?.bullets || ruleBriefing.brochureCopy.bullets).slice(0, 4),
    },
    missingChecks: unique([...(llmBriefing.missingChecks || []), ...(ruleBriefing.missingChecks || [])]).slice(0, 8),
  });
}

export function sanitizeBriefingLanguage(value) {
  const replacements = [
    [/무조건/g, "우선"],
    [/확실히/g, "상대적으로"],
    [/신뢰도/g, "조건 적합도"],
    [/추천\s*확률/g, "추천 참고 점수"],
    [/확률/g, "참고 점수"],
    [/보장/g, "참고"],
    [/수익\s*보장/g, "수익 관련 확인"],
    [/계약\s*확정/g, "계약 검토"],
  ];

  if (typeof value === "string") {
    return replacements.reduce((textValue, [pattern, replacement]) => textValue.replace(pattern, replacement), value);
  }
  if (Array.isArray(value)) return value.map(sanitizeBriefingLanguage);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeBriefingLanguage(item)]));
  }
  return value;
}
