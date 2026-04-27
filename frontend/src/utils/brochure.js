const HIDDEN_VALUES = new Set([
  "",
  "-",
  "-/-",
  "선택",
  "없음",
  "null",
  "undefined",
  "nan",
  "n/a",
  "예:",
  "확인 필요",
]);

const CONTAIN_IMAGE_TOKENS = [
  "평면",
  "도면",
  "floorplan",
  "plan",
  "layout",
  "blueprint",
];

export function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function hasValue(value) {
  return normalizeText(value) !== "";
}

export function isMeaningfulText(value) {
  const text = normalizeText(value);
  if (!text) return false;
  if (HIDDEN_VALUES.has(text.toLowerCase())) return false;
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

  if (compactDisplayValue(form.price_status)) {
    return form.price_status;
  }

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
      label: form.deal_type === "월세" ? "보증금" : compactDisplayValue(form.deal_type) || "금액",
      value: formatAmount(form.deposit, form.price_unit || "만원"),
    },
    form.deal_type === "월세" &&
      isMeaningfulText(form.monthly_rent) && {
        label: "월차임",
        value: formatAmount(form.monthly_rent, form.price_unit || "만원"),
      },
    isMeaningfulText(form.maintenance_fee) && {
      label: "관리비",
      value: formatAmount(form.maintenance_fee, form.price_unit || "만원"),
    },
    isMeaningfulText(form.premium) && {
      label: "권리금",
      value: formatAmount(form.premium, form.price_unit || "만원"),
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
    return "보증금 또는 월차임이 일부만 확인되었습니다. 실제 계약 조건은 다시 확인해 주세요.";
  }
  if (status === "manual_required") {
    return "금액 정보가 일부만 확인되었습니다. 보증금, 월차임, 권리금을 직접 확인해 주세요.";
  }
  return "가격을 정확히 읽지 못했습니다. 보증금, 월차임, 관리비를 직접 확인해 주세요.";
}

export function buildAreaText(form) {
  const parts = [];
  if (isMeaningfulText(form.supply_area)) {
    parts.push(`공급 ${form.supply_area}${compactDisplayValue(form.supply_area_unit) || "㎡"}`);
  }
  if (isMeaningfulText(form.exclusive_area)) {
    parts.push(`전용 ${form.exclusive_area}${compactDisplayValue(form.exclusive_area_unit) || "㎡"}`);
  }
  return parts.join(" / ");
}

export function buildParkingText(form) {
  const parts = [];
  if (isMeaningfulText(form.parking_count)) parts.push(`${normalizeText(form.parking_count)}대`);
  if (isMeaningfulText(form.parking_type)) parts.push(normalizeText(form.parking_type));
  if (isMeaningfulText(form.parking_fee) && normalizeText(form.parking_type) === "유료") {
    parts.push(formatAmount(form.parking_fee, form.price_unit || "만원"));
  }
  return parts.join(" / ");
}

export function buildRestroomText(form) {
  if (isMeaningfulText(form.restroom_detail)) return normalizeText(form.restroom_detail);
  return compactDisplayValue(form.restroom_type);
}

function buildAreaForSummary(form) {
  if (isMeaningfulText(form.exclusive_area)) {
    return `전용 ${form.exclusive_area}${compactDisplayValue(form.exclusive_area_unit) || "㎡"}`;
  }
  if (isMeaningfulText(form.supply_area)) {
    return `공급 ${form.supply_area}${compactDisplayValue(form.supply_area_unit) || "㎡"}`;
  }
  return "";
}

function uniquePush(target, value) {
  if (value && !target.includes(value)) {
    target.push(value);
  }
}

export function buildOneLineSummary(form) {
  const address = compactDisplayValue(form.address);
  const area = buildAreaForSummary(form);
  const floor = compactDisplayValue(form.floor);
  const availableFrom = compactDisplayValue(form.available_from);
  const recommendedIndustry = compactDisplayValue(form.recommended_industry);

  const subject = [address, area, floor && `${floor} 규모`].filter(Boolean).join(" ");
  const target = recommendedIndustry
    ? `${recommendedIndustry} 업종이나 소규모 사무공간으로 검토하기 좋은 매물입니다.`
    : "소규모 사무공간이나 실무형 업무 공간으로 검토하기 좋은 매물입니다.";

  if (subject && availableFrom) {
    return `${subject} 조건으로, ${availableFrom} 협의가 가능하며 ${target}`;
  }

  if (subject) {
    return `${subject} 조건으로 ${target}`;
  }

  if (availableFrom) {
    return `${availableFrom} 협의가 가능하며 ${target}`;
  }

  return target;
}

export function buildKeyStrengths(form) {
  const strengths = [];
  const address = compactDisplayValue(form.address);
  const availableFrom = compactDisplayValue(form.available_from);
  const parkingText = buildParkingText(form);
  const elevator = compactDisplayValue(form.elevator);
  const signAllowed = compactDisplayValue(form.sign_allowed);
  const hvac = compactDisplayValue(form.hvac);
  const recommendedIndustry = compactDisplayValue(form.recommended_industry);
  const maintenanceIncludes = compactDisplayValue(form.maintenance_includes);

  if (address) uniquePush(strengths, "입지 확인 완료");
  if (/즉시|바로/.test(availableFrom)) uniquePush(strengths, "즉시 입주 가능");
  if (parkingText) uniquePush(strengths, "주차 조건 확인");
  if (elevator === "유") uniquePush(strengths, "엘리베이터 있음");
  if (signAllowed && !/불가/.test(signAllowed)) uniquePush(strengths, "간판 협의 가능");
  if (hvac) uniquePush(strengths, `${hvac} 정보`);
  if (recommendedIndustry) uniquePush(strengths, "추천 업종 명확");
  if (maintenanceIncludes) uniquePush(strengths, "관리비 포함 항목 확인");

  const description = normalizeText(form.description);
  ["역세권", "가시성 우수", "대로변", "채광 우수", "테라스", "인테리어 우수"].forEach((token) => {
    if (description.includes(token)) uniquePush(strengths, token);
  });

  return strengths.slice(0, 4);
}

export function buildRecommendedTargets(form) {
  const targets = [];
  const recommendedIndustry = compactDisplayValue(form.recommended_industry);
  const exclusiveArea = Number(cleanNumber(form.exclusive_area));
  const signAllowed = compactDisplayValue(form.sign_allowed);

  if (recommendedIndustry) {
    recommendedIndustry
      .split(/[,\n/]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => uniquePush(targets, item));
  }

  if (exclusiveArea && exclusiveArea <= 40) uniquePush(targets, "1~3인 소규모 사무실");
  if (exclusiveArea > 40 && exclusiveArea <= 100) uniquePush(targets, "예약제 업종 또는 소형 사무실");
  if (signAllowed && !/불가/.test(signAllowed)) uniquePush(targets, "노출형 업종 검토 가능");

  return targets.slice(0, 4);
}

export function buildConsultPoints(form) {
  const points = [];
  const availableFrom = compactDisplayValue(form.available_from);
  const maintenanceIncludes = compactDisplayValue(form.maintenance_includes);
  const parkingText = buildParkingText(form);
  const restroomText = buildRestroomText(form);
  const hvac = compactDisplayValue(form.hvac);
  const signAllowed = compactDisplayValue(form.sign_allowed);

  if (availableFrom) points.push(`입주 가능일: ${availableFrom}`);
  if (maintenanceIncludes) points.push(`관리비 포함 항목: ${maintenanceIncludes}`);
  if (parkingText) points.push(`주차 조건: ${parkingText}`);
  if (restroomText) points.push(`화장실 정보: ${restroomText}`);
  if (hvac) points.push(`냉난방: ${hvac}`);
  if (signAllowed) points.push(`간판 가능 여부: ${signAllowed}`);
  return points.slice(0, 4);
}

export function buildCheckItems(form) {
  const items = [];
  const priceStatus = form.price_status || getPriceStatus(form);

  if (priceStatus !== "ok") items.push("정확한 보증금/월차임");
  if (!isMeaningfulText(form.maintenance_includes)) items.push("관리비 포함 항목");
  if (!isMeaningfulText(form.parking_count)) items.push("주차 가능 대수");
  if (!buildRestroomText(form)) items.push("화장실 위치/형태");
  if (!isMeaningfulText(form.recommended_industry)) items.push("추천 업종 또는 업종 제한 여부");

  if (isMeaningfulText(form.caution_notes)) {
    normalizeText(form.caution_notes)
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => uniquePush(items, item));
  }

  return items.slice(0, 5);
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
  return [
    compactDisplayValue(form.title) || "사무실/상가 소개서",
    summary,
    price ? `가격: ${price}` : "",
    isMeaningfulText(form.address) ? `주소: ${normalizeText(form.address)}` : "",
    brochureUrl ? `소개서 보기: ${brochureUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function resolveImageSource(image) {
  if (!image) return "";
  if (typeof image === "string") return image;
  if (image.url) return image.url;
  if (image instanceof Blob || image instanceof File) return URL.createObjectURL(image);
  return "";
}

function inferImageFit(image) {
  const haystack = normalizeText(
    [image?.name, image?.label, image?.alt, image?.src || image?.url].filter(Boolean).join(" "),
  ).toLowerCase();

  return CONTAIN_IMAGE_TOKENS.some((token) => haystack.includes(token.toLowerCase()))
    ? "contain"
    : "cover";
}

function normalizeImageItem(image, index = 0) {
  const src = resolveImageSource(image);
  if (!src) return null;

  return {
    src,
    alt: compactDisplayValue(image?.alt) || `사진 ${index + 1}`,
    fit: inferImageFit(image),
  };
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
  const location = sanitizeFileName(address.split(" ").slice(0, 3).join(" "));
  const base = title || location || "부동산_소개서";
  return `${base}_소개서.pdf`;
}

export function normalizeBriefingData(form, options = {}) {
  const { result, mainImage, extraImages = [], pdfAssets } = options;
  const briefing = buildBriefing(form);
  const priceSummary = buildPriceSummary(form);
  const address = compactDisplayValue(form.address);
  const title = compactDisplayValue(form.title) || "사무실 / 상가 소개서";
  const description = compactDisplayValue(form.description);
  const areaText = buildAreaText(form);

  const infoItems = [
    isMeaningfulText(form.exclusive_area) && {
      label: "전용면적",
      value: `${form.exclusive_area}${compactDisplayValue(form.exclusive_area_unit) || "㎡"}`,
    },
    isMeaningfulText(form.supply_area) && {
      label: "공급면적",
      value: `${form.supply_area}${compactDisplayValue(form.supply_area_unit) || "㎡"}`,
    },
    isMeaningfulText(form.floor) && { label: "층수", value: compactDisplayValue(form.floor) },
    isMeaningfulText(form.elevator) && { label: "엘리베이터", value: compactDisplayValue(form.elevator) },
    isMeaningfulText(form.available_from) && { label: "입주 가능일", value: compactDisplayValue(form.available_from) },
    buildRestroomText(form) && { label: "화장실", value: buildRestroomText(form) },
    buildParkingText(form) && { label: "주차", value: buildParkingText(form) },
    isMeaningfulText(form.maintenance_fee) && {
      label: "관리비",
      value: formatAmount(form.maintenance_fee, form.price_unit || "만원"),
    },
    isMeaningfulText(form.premium) && {
      label: "권리금",
      value: formatAmount(form.premium, form.price_unit || "만원"),
    },
    isMeaningfulText(form.recommended_industry) && {
      label: "추천 업종",
      value: compactDisplayValue(form.recommended_industry),
    },
    isMeaningfulText(form.hvac) && { label: "냉난방", value: compactDisplayValue(form.hvac) },
    isMeaningfulText(form.sign_allowed) && {
      label: "간판 가능 여부",
      value: compactDisplayValue(form.sign_allowed),
    },
  ].filter(Boolean);

  const pdfMainImageSrc = pdfAssets?.mainImageSrc || result?.image_url || resolveImageSource(mainImage);
  const fallbackExtraImages = result?.extra_image_urls?.length
    ? result.extra_image_urls.map((url) => ({ url }))
    : extraImages;

  const extraPhotoInputs = pdfAssets?.extraImageSources?.length
    ? pdfAssets.extraImageSources.map((src, index) => ({ url: src, name: `pdf-image-${index + 1}` }))
    : fallbackExtraImages;

  const mainPhoto = normalizeImageItem(
    pdfMainImageSrc ? { url: pdfMainImageSrc, name: result?.image_filename || "대표사진" } : null,
    0,
  );
  const extraPhotos = extraPhotoInputs
    .map((image, index) => normalizeImageItem(image, index + 1))
    .filter(Boolean)
    .slice(0, 4);

  const officeName = compactDisplayValue(form.office_name);
  const contactName = compactDisplayValue(form.contact_name);
  const contactPhone = compactDisplayValue(form.contact_phone);
  const contactEmail = compactDisplayValue(form.contact_email);

  const footerItems = [
    officeName && { label: "부동산", value: officeName },
    contactName && { label: "담당자", value: contactName },
    contactPhone && { label: "연락처", value: contactPhone },
    contactEmail && { label: "이메일", value: contactEmail },
  ].filter(Boolean);

  return {
    title,
    address,
    dealType: compactDisplayValue(form.deal_type) || "월세",
    priceSummary,
    oneLineSummary: briefing.oneLineSummary,
    strengths: briefing.strengths,
    infoItems,
    descriptionLines: [description, areaText ? `면적 기준: ${areaText}` : ""].filter(Boolean),
    recommendedTargets: briefing.recommendedTargets,
    consultPoints: briefing.consultPoints,
    checkItems: briefing.checkItems,
    officeName,
    contactName,
    contactPhone,
    contactEmail,
    footerItems,
    mainPhoto,
    extraPhotos,
    extraPhotoOverflow: Math.max(0, (result?.extra_image_urls?.length || extraImages.length || 0) - extraPhotos.length),
  };
}
