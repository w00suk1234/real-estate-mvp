import { buildPriceSummary, cleanNumber, compactDisplayValue, normalizeText } from "./brochure";

const DEAL_TYPES = ["월세", "전세", "매매"];
const LOCATION_STOP_WORDS = new Set([
  "예산",
  "보증금",
  "월세",
  "전세",
  "매매",
  "사무실",
  "상가",
  "주거",
  "희망",
  "조건",
  "주차",
  "엘리베이터",
]);
const KEYWORD_TOKENS = ["신혼부부", "1인가구", "가족", "투자자", "직장인", "역세권", "깔끔한", "주차", "반려동물", "신축", "채광", "대로변"];

function numberFromText(value) {
  const numeric = cleanNumber(value);
  return numeric ? Number(numeric) : 0;
}

function amountToManwon(value, unit = "만원") {
  const number = numberFromText(value);
  if (!number) return 0;
  return String(unit).includes("억") ? number * 10000 : number;
}

function includesAny(text, tokens) {
  const source = normalizeText(text).toLowerCase();
  return tokens.some((token) => source.includes(String(token).toLowerCase()));
}

function splitKeywords(value) {
  return normalizeText(value)
    .split(/[,\n/| ]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !LOCATION_STOP_WORDS.has(item));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function inferDealType(...values) {
  const text = normalizeText(values.filter(Boolean).join(" "));
  return DEAL_TYPES.find((type) => text.includes(type)) || "";
}

function inferBoolean(text, positiveTokens, explicitField) {
  if (typeof explicitField === "boolean") return explicitField;
  const source = normalizeText([text, explicitField].filter(Boolean).join(" "));
  if (!source) return false;
  return positiveTokens.some((token) => source.includes(token));
}

function parseBudgetFromText(text) {
  const source = normalizeText(text);
  const maxDepositMatch = source.match(/보증금\s*([0-9,.]+)\s*(억|억원|만원)?\s*(이하|까지|안쪽|내외)?/);
  const maxMonthlyMatch = source.match(/(?:월세|월차임)\s*([0-9,.]+)\s*(만원)?\s*(이하|까지|안쪽|내외)?/);
  const maxSaleMatch = source.match(/(?:매매|전세|예산|금액)\s*([0-9,.]+)\s*(억|억원|만원)?\s*(이하|까지|안쪽|내외)?/);

  return {
    maxDeposit: amountToManwon(maxDepositMatch?.[1], maxDepositMatch?.[2] || "만원"),
    maxMonthlyRent: amountToManwon(maxMonthlyMatch?.[1], "만원"),
    maxPrice: amountToManwon(maxSaleMatch?.[1], maxSaleMatch?.[2] || "만원"),
  };
}

function parseAreaFromText(text) {
  const source = normalizeText(text);
  const m2Match = source.match(/([0-9,.]+)\s*(?:㎡|m2|제곱미터)/i);
  const pyeongMatch = source.match(/([0-9,.]+)\s*평/);
  if (m2Match) return numberFromText(m2Match[1]);
  if (pyeongMatch) return Math.round(numberFromText(pyeongMatch[1]) * 3.3058 * 10) / 10;
  return 0;
}

function parseRoomsFromText(text) {
  const source = normalizeText(text);
  const match = source.match(/(?:방|룸)\s*([0-9]+)/) || source.match(/([0-9]+)\s*(?:룸|방)/);
  return match ? Number(match[1]) : 0;
}

function parseDate(value) {
  if (!value) return null;
  const source = normalizeText(value);
  if (/즉시|바로/.test(source)) return new Date();
  const match = source.match(/(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})?/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3] || 1));
}

export function normalizeCustomerCondition(customer = {}) {
  const notes = normalizeText([
    customer.wanted_condition,
    customer.important_notes,
    customer.memo,
    customer.notes,
    customer.requirement,
    customer.preferred_area,
    customer.preferred_locations,
    customer.property_type,
    customer.customer_type,
  ].filter(Boolean).join(" "));
  const inferredBudget = parseBudgetFromText(notes);
  const rawLocations = [
    customer.preferred_area,
    customer.location,
    customer.preferred_locations,
    ...splitKeywords(customer.preferred_area || ""),
  ];

  return {
    id: customer.id,
    name: compactDisplayValue(customer.name) || "고객",
    phone: compactDisplayValue(customer.phone),
    dealType: customer.preferred_deal_type || inferDealType(notes),
    maxPrice: amountToManwon(customer.max_price) || inferredBudget.maxPrice,
    maxDeposit: amountToManwon(customer.max_deposit) || inferredBudget.maxDeposit,
    maxMonthlyRent: amountToManwon(customer.max_monthly_rent) || inferredBudget.maxMonthlyRent,
    locations: unique(rawLocations.flatMap((item) => splitKeywords(item))).slice(0, 6),
    minRooms: Number(customer.min_rooms) || parseRoomsFromText(notes),
    minAreaM2: Number(customer.min_area_m2) || parseAreaFromText(notes),
    parkingRequired: inferBoolean(notes, ["주차 필수", "주차 필요", "주차가능", "주차 가능"], customer.parking_required),
    elevatorRequired: inferBoolean(notes, ["엘리베이터 필수", "엘베 필수", "엘리베이터 필요", "엘리베이터"], customer.elevator_required),
    moveInDeadline: customer.move_in_deadline || "",
    importantNotes: notes,
    customerType: compactDisplayValue(customer.customer_type) || KEYWORD_TOKENS.find((token) => notes.includes(token)) || "",
    raw: customer,
  };
}

export function normalizePropertyData(property = {}) {
  const form = property.data?.form || property.form || property.data || {};
  const description = normalizeText([
    property.description,
    property.tags,
    property.price_summary,
    form.description,
    form.special_notes,
    form.recommended_use,
  ].filter(Boolean).join(" "));
  const unit = form.price_unit || form.unit || "만원";
  const dealType = property.deal_type || form.deal_type || inferDealType(property.title, description);
  const deposit = amountToManwon(property.deposit ?? form.deposit, unit);
  const monthlyRent = amountToManwon(property.monthly_rent ?? form.monthly_rent, unit);
  const price = amountToManwon(property.price ?? form.price ?? (dealType === "매매" ? form.deposit : ""), unit) || deposit;

  return {
    id: property.id || property.property_id,
    title: compactDisplayValue(property.title || form.title) || "매물명 미입력",
    address: compactDisplayValue(property.address || form.address),
    dong: compactDisplayValue(property.dong || form.dong),
    location: compactDisplayValue(property.location || form.location),
    dealType,
    price,
    deposit,
    monthlyRent,
    areaM2: Number(property.area_m2) || parseAreaFromText(`${form.exclusive_area || ""}${form.exclusive_area_unit || ""}`) || parseAreaFromText(`${form.supply_area || ""}${form.supply_area_unit || ""}`),
    rooms: Number(property.rooms) || parseRoomsFromText(description),
    bathrooms: Number(property.bathrooms) || 0,
    floor: compactDisplayValue(property.floor || form.floor),
    parking: inferBoolean(description, ["주차", "주차 가능"], property.parking ?? form.parking_count),
    elevator: inferBoolean(description, ["엘리베이터 있음", "엘리베이터", "엘베"], property.elevator ?? form.elevator),
    moveInDate: property.move_in_date || form.move_in_date || "",
    description,
    tags: Array.isArray(property.tags) ? property.tags : splitKeywords(property.tags || description),
    imageUrl: property.main_image_url || property.image_url || form.main_image_url || property.data?.main_image_url || "",
    priceSummary: property.price_summary || property.price || buildPriceSummary(form),
    raw: property,
  };
}

function scoreBudget(customer, property, matchedReasons, warnings) {
  const isMonthly = property.dealType === "월세";
  const maxPrice = isMonthly ? customer.maxDeposit || customer.maxPrice : customer.maxPrice || customer.maxDeposit;
  const targetPrice = isMonthly ? property.deposit : property.price || property.deposit;
  const monthlyOk = !isMonthly || !customer.maxMonthlyRent || !property.monthlyRent || property.monthlyRent <= customer.maxMonthlyRent;

  if (!targetPrice && !property.monthlyRent) {
    warnings.push("가격 확인 필요");
    return 8;
  }
  if (!maxPrice && !customer.maxMonthlyRent) {
    warnings.push("고객 예산 확인 필요");
    return 12;
  }

  const ratio = maxPrice && targetPrice ? targetPrice / maxPrice : 1;
  if (ratio <= 1 && monthlyOk) {
    matchedReasons.push("예산 범위 안에 있습니다.");
    return 25;
  }
  if (ratio <= 1.12 && monthlyOk) {
    warnings.push("예산을 약간 초과할 수 있습니다.");
    return 15;
  }
  warnings.push("예산보다 높은 매물일 수 있습니다.");
  return 3;
}

export function calculatePropertyMatchScore(customerInput, propertyInput) {
  const customer = customerInput?.raw ? customerInput : normalizeCustomerCondition(customerInput);
  const property = propertyInput?.raw ? propertyInput : normalizePropertyData(propertyInput);
  const matchedReasons = [];
  const warnings = [];
  let score = 0;

  if (customer.dealType && property.dealType) {
    if (customer.dealType === property.dealType) {
      score += 20;
      matchedReasons.push("희망 거래유형과 일치합니다.");
    } else {
      score -= 8;
      warnings.push("희망 거래유형과 다를 수 있습니다.");
    }
  } else {
    score += 8;
    warnings.push("거래유형 확인 필요");
  }

  score += scoreBudget(customer, property, matchedReasons, warnings);

  const locationText = [property.address, property.dong, property.location, property.description].join(" ");
  if (customer.locations.length && normalizeText(locationText)) {
    if (customer.locations.some((keyword) => locationText.includes(keyword))) {
      score += 20;
      matchedReasons.push("희망지역과 일치합니다.");
    } else {
      score += 4;
      warnings.push("희망지역과 거리가 있을 수 있습니다.");
    }
  } else if (!normalizeText(locationText)) {
    score += 7;
    warnings.push("지역 정보 확인 필요");
  } else {
    score += 10;
    warnings.push("고객 희망지역 확인 필요");
  }

  if (customer.minRooms || customer.minAreaM2) {
    let subScore = 0;
    if (customer.minRooms && property.rooms) {
      if (property.rooms >= customer.minRooms) {
        subScore += 7;
        matchedReasons.push(`방 ${customer.minRooms}개 이상 조건을 충족합니다.`);
      } else {
        warnings.push("방 개수 조건은 확인이 필요합니다.");
      }
    }
    if (customer.minAreaM2 && property.areaM2) {
      if (property.areaM2 >= customer.minAreaM2) {
        subScore += 8;
        matchedReasons.push("희망 면적 조건을 충족합니다.");
      } else {
        warnings.push("면적 조건보다 작을 수 있습니다.");
      }
    }
    if (!subScore) warnings.push("방 개수/면적 확인 필요");
    score += subScore || 5;
  } else {
    score += 8;
    warnings.push("방 개수/면적 확인 필요");
  }

  let optionScore = 0;
  if (customer.parkingRequired) {
    if (property.parking) {
      optionScore += 5;
      matchedReasons.push("주차 가능 조건을 충족합니다.");
    } else {
      warnings.push("주차 가능 여부 확인 필요");
    }
  }
  if (customer.elevatorRequired) {
    if (property.elevator) {
      optionScore += 5;
      matchedReasons.push("엘리베이터 조건을 충족합니다.");
    } else {
      warnings.push("엘리베이터 여부 확인 필요");
    }
  }
  if (!customer.parkingRequired && property.parking) optionScore += 3;
  if (!customer.elevatorRequired && property.elevator) optionScore += 3;
  if (includesAny(property.description, ["신축", "역세권", "깔끔", "채광"])) optionScore += 2;
  score += Math.min(10, optionScore);

  const deadline = parseDate(customer.moveInDeadline);
  const moveInDate = parseDate(property.moveInDate);
  if (deadline && moveInDate) {
    if (moveInDate <= deadline) {
      score += 5;
      matchedReasons.push("입주 희망일 안에 검토 가능합니다.");
    } else {
      warnings.push("입주 가능일이 늦을 수 있습니다.");
    }
  } else {
    score += 2;
    warnings.push("입주 가능일 확인 필요");
  }

  const memoTokens = unique(splitKeywords([customer.importantNotes, customer.customerType].join(" "))).filter((token) => KEYWORD_TOKENS.includes(token));
  const keywordMatches = memoTokens.filter((token) => includesAny([property.description, property.tags.join(" ")].join(" "), [token]));
  if (keywordMatches.length) {
    score += 5;
    matchedReasons.push(`${keywordMatches.slice(0, 2).join(", ")} 선호 키워드와 맞습니다.`);
  } else if (customer.customerType) {
    score += 2;
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    property: property.raw,
    normalizedProperty: property,
    score: finalScore,
    matchPercent: finalScore,
    matchedReasons: matchedReasons.slice(0, 6),
    warnings: unique(warnings).slice(0, 5),
    customerMessage: buildCustomerMessage(customer, property, matchedReasons, warnings),
  };
}

export function recommendPropertiesForCustomer(customer, properties, options = {}) {
  const limit = options.limit || 5;
  const normalizedCustomer = normalizeCustomerCondition(customer);
  return (properties || [])
    .map((property) => calculatePropertyMatchScore(normalizedCustomer, normalizePropertyData(property)))
    .filter((result) => result.score >= (options.minScore ?? 20))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function hasEnoughCustomerCondition(customer) {
  const normalized = normalizeCustomerCondition(customer);
  return Boolean(
    normalized.dealType ||
      normalized.maxPrice ||
      normalized.maxDeposit ||
      normalized.maxMonthlyRent ||
      normalized.locations.length ||
      normalized.minRooms ||
      normalized.minAreaM2 ||
      normalized.parkingRequired ||
      normalized.elevatorRequired,
  );
}

export function buildCustomerMessage(customer, property, matchedReasons = [], warnings = []) {
  const customerType = customer.customerType ? `${customer.customerType} 기준으로도 ` : "";
  const title = property.title && property.title !== "매물명 미입력" ? `${property.title} 매물은 ` : "이 매물은 ";
  const strengths = matchedReasons.length
    ? matchedReasons.slice(0, 2).map((reason) => reason.replace("합니다.", "해 보입니다.")).join(" ")
    : "조건을 함께 확인해볼 만해 보입니다.";
  const caution = warnings.length ? ` 다만 ${warnings[0]} 부분은 별도 확인이 필요해 보입니다.` : "";
  return `${title}${customerType}${strengths} 한번 보시면 좋을 것 같습니다.${caution}`;
}
