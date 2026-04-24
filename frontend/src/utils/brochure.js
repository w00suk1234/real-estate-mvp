const HIDDEN_VALUES = new Set([
  "",
  "-",
  "-/-",
  "선택",
  "없음",
  "null",
  "undefined",
]);

export function hasValue(value) {
  return String(value ?? "").trim() !== "";
}

export function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function isMeaningfulText(value) {
  const text = normalizeText(value);
  if (!text) return false;
  if (HIDDEN_VALUES.has(text)) return false;
  if (text === "0") return false;
  if (text.startsWith("예:")) return false;
  return true;
}

export function compactDisplayValue(value) {
  return isMeaningfulText(value) ? normalizeText(value) : "";
}

export function cleanNumber(value) {
  const match = String(value ?? "").match(/[\d,.]+/);
  return match ? match[0].replaceAll(",", "") : "";
}

export function formatAmount(value, unit = "만원") {
  const numeric = cleanNumber(value);
  if (!numeric) return "";

  const [integerPart, decimalPart] = numeric.split(".");
  const formatted = Number(integerPart).toLocaleString("ko-KR");
  return decimalPart ? `${formatted}.${decimalPart}${unit}` : `${formatted}${unit}`;
}

export function getPriceStatus(form) {
  const deposit = cleanNumber(form.deposit);
  const monthlyRent = cleanNumber(form.monthly_rent);
  const maintenanceFee = cleanNumber(form.maintenance_fee);
  const premium = cleanNumber(form.premium);

  if (form.deal_type === "월세") {
    if (deposit && monthlyRent) return "ok";
    if (!deposit && !monthlyRent && (maintenanceFee || premium)) return "manual_required";
    if (deposit || monthlyRent) return "partial";
    return "missing";
  }

  if (deposit) return "ok";
  if (maintenanceFee || premium) return "manual_required";
  return "missing";
}

export function buildPriceParts(form) {
  return [
    isMeaningfulText(form.deposit) && {
      label: form.deal_type === "월세" ? "보증금" : form.deal_type,
      value: formatAmount(form.deposit, form.price_unit),
    },
    form.deal_type === "월세" &&
      isMeaningfulText(form.monthly_rent) && {
        label: "월차임",
        value: formatAmount(form.monthly_rent, form.price_unit),
      },
    isMeaningfulText(form.maintenance_fee) && {
      label: "관리비",
      value: formatAmount(form.maintenance_fee, form.price_unit),
    },
    isMeaningfulText(form.premium) && {
      label: "권리금",
      value: formatAmount(form.premium, form.price_unit),
    },
  ].filter(Boolean);
}

export function buildPriceSummary(form) {
  const status = form.price_status || getPriceStatus(form);
  const parts = buildPriceParts(form).map((part) => `${part.label} ${part.value}`);

  if (status === "ok") {
    return parts.join(" · ");
  }

  if (status === "partial") {
    return parts.length ? `가격 확인 필요 · ${parts.join(" · ")}` : "가격 확인 필요";
  }

  if (status === "manual_required") {
    return parts.length ? `금액 협의 · ${parts.join(" · ")}` : "금액 협의";
  }

  return parts.length ? parts.join(" · ") : "금액 확인 필요";
}

export function buildPriceWarning(form) {
  const status = form.price_status || getPriceStatus(form);
  if (status === "ok") return "";
  if (status === "partial") {
    return "보증금 또는 월차임 일부만 확인되어 있습니다. 실제 계약 금액을 한 번 더 확인해 주세요.";
  }
  if (status === "manual_required") {
    return "금액 정보가 일부만 확인되었습니다. 보증금, 월차임, 권리금을 직접 확인해 주세요.";
  }
  return "가격을 정확히 읽지 못했습니다. 보증금, 월차임, 관리비를 직접 확인해 주세요.";
}

export function buildAreaText(form) {
  const parts = [];
  if (isMeaningfulText(form.supply_area)) parts.push(`공급 ${form.supply_area}${form.supply_area_unit}`);
  if (isMeaningfulText(form.exclusive_area)) parts.push(`전용 ${form.exclusive_area}${form.exclusive_area_unit}`);
  return parts.join(" / ");
}

export function buildParkingText(form) {
  const parts = [];
  if (isMeaningfulText(form.parking_count)) parts.push(`${form.parking_count}대`);
  if (isMeaningfulText(form.parking_type)) parts.push(form.parking_type);
  if (isMeaningfulText(form.parking_fee)) parts.push(formatAmount(form.parking_fee, form.price_unit));
  return parts.join(" / ");
}

export function buildRestroomText(form) {
  if (isMeaningfulText(form.restroom_detail)) return normalizeText(form.restroom_detail);
  return compactDisplayValue(form.restroom_type);
}

function buildAreaForSummary(form) {
  if (isMeaningfulText(form.exclusive_area)) return `전용 ${form.exclusive_area}${form.exclusive_area_unit}`;
  if (isMeaningfulText(form.supply_area)) return `공급 ${form.supply_area}${form.supply_area_unit}`;
  return "";
}

export function buildOneLineSummary(form) {
  const address = compactDisplayValue(form.address);
  const area = buildAreaForSummary(form);
  const floor = compactDisplayValue(form.floor);
  const recommendedIndustry = compactDisplayValue(form.recommended_industry);
  const parking = buildParkingText(form);

  const summaryBits = [address, floor && `${floor} 기준`, area, parking && "주차 조건 확인 가능"].filter(Boolean);
  const suffix = recommendedIndustry ? `${recommendedIndustry}에 어울리는` : "사무실형";

  if (summaryBits.length === 0) {
    return `${suffix} 매물입니다.`;
  }

  return `${summaryBits.join(", ")} 조건을 갖춘 ${suffix} 매물입니다.`;
}

export function buildKeyStrengths(form) {
  const strengths = [];

  if (isMeaningfulText(form.address)) strengths.push("위치 확인 완료");
  if (/즉시|바로/.test(String(form.available_from || ""))) strengths.push("즉시 입주 가능");
  if (isMeaningfulText(form.parking_count)) strengths.push("주차 가능");
  if (normalizeText(form.elevator) === "유") strengths.push("엘리베이터 있음");
  if (isMeaningfulText(form.sign_allowed) && !/불가/.test(form.sign_allowed)) strengths.push("간판 협의 가능");
  if (isMeaningfulText(form.hvac)) strengths.push(`${normalizeText(form.hvac)} 구비`);
  if (isMeaningfulText(form.recommended_industry)) strengths.push("추천 업종 명확");
  if (isMeaningfulText(form.maintenance_includes)) strengths.push("관리비 포함 항목 확인 가능");

  const description = normalizeText(form.description);
  for (const token of ["역세권", "가시성 우수", "대로변", "채광 우수", "내부화장실", "테라스", "즉시 입주"]) {
    if (description.includes(token) && !strengths.includes(token)) {
      strengths.push(token);
    }
  }

  return strengths.slice(0, 4);
}

export function buildRecommendedTargets(form) {
  const targets = [];
  if (isMeaningfulText(form.recommended_industry)) {
    targets.push(
      ...normalizeText(form.recommended_industry)
        .split(/[,\n/]/)
        .map((item) => item.trim())
        .filter(Boolean),
    );
  }

  const exclusiveArea = Number(cleanNumber(form.exclusive_area));
  if (exclusiveArea && exclusiveArea <= 40) targets.push("1~3인 소규모 사무실");
  if (exclusiveArea > 40 && exclusiveArea <= 100) targets.push("예약제 업종 또는 소형 사무실");
  if (isMeaningfulText(form.sign_allowed) && !/불가/.test(form.sign_allowed)) targets.push("노출형 업종 검토 가능");

  return [...new Set(targets)].slice(0, 4);
}

export function buildConsultPoints(form) {
  const points = [];
  if (isMeaningfulText(form.available_from)) points.push(`입주 가능일: ${normalizeText(form.available_from)}`);
  if (isMeaningfulText(form.maintenance_includes)) points.push(`관리비 포함 항목: ${normalizeText(form.maintenance_includes)}`);
  if (buildParkingText(form)) points.push(`주차 조건: ${buildParkingText(form)}`);
  if (buildRestroomText(form)) points.push(`화장실: ${buildRestroomText(form)}`);
  if (isMeaningfulText(form.hvac)) points.push(`냉난방: ${normalizeText(form.hvac)}`);
  if (isMeaningfulText(form.sign_allowed)) points.push(`간판 가능 여부: ${normalizeText(form.sign_allowed)}`);
  return points.slice(0, 4);
}

export function buildCheckItems(form) {
  const items = [];
  const priceWarning = buildPriceWarning(form);
  if (priceWarning) items.push("정확한 보증금/월차임");
  if (!isMeaningfulText(form.maintenance_includes)) items.push("관리비 포함 항목");
  if (!isMeaningfulText(form.parking_count)) items.push("주차 가능 대수");
  if (!buildRestroomText(form)) items.push("화장실 위치/형태");
  if (!isMeaningfulText(form.recommended_industry)) items.push("추천 업종 또는 업종 제한 여부");
  if (isMeaningfulText(form.caution_notes)) {
    items.push(
      ...normalizeText(form.caution_notes)
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    );
  }
  return [...new Set(items)].slice(0, 5);
}

export function buildBriefing(form) {
  return {
    oneLineSummary: buildOneLineSummary(form),
    strengths: buildKeyStrengths(form),
    recommendedTargets: buildRecommendedTargets(form),
    consultPoints: buildConsultPoints(form),
    checkItems: buildCheckItems(form),
  };
}

export function buildShareMessage(form, brochureUrl = "") {
  const summary = buildOneLineSummary(form);
  const price = buildPriceSummary(form);
  const lines = [
    form.title || "사무실/상가 소개",
    summary,
    price ? `가격: ${price}` : "",
    isMeaningfulText(form.address) ? `주소: ${normalizeText(form.address)}` : "",
    brochureUrl ? `소개서 보기: ${brochureUrl}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

export function resolveImageSource(image) {
  if (!image) return "";
  if (typeof image === "string") return image;
  if (image.url) return image.url;
  return URL.createObjectURL(image);
}

export function sanitizeFileName(text) {
  return normalizeText(text)
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildPdfFileName(form) {
  const title = sanitizeFileName(form.title || "");
  const address = normalizeText(form.address || "");
  const location = sanitizeFileName(address.split(" ").slice(0, 2).join(" "));
  const base = title || location || "부동산_소개서";
  return `${base}_소개서.pdf`;
}
