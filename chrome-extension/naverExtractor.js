(function attachNaverExtractor(global) {
  const FIELD_LABELS = {
    title: "매물명 확인 필요",
    price: "가격 확인 필요",
    area: "면적 확인 필요",
    address: "주소 확인 필요",
    parking: "주차 확인 필요",
    elevator: "엘리베이터 확인 필요",
    moveInDate: "입주 가능일 확인 필요",
  };

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeLines(value) {
    const seen = new Set();
    return String(value || "")
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean)
      .filter((line) => line.length <= 180)
      .filter((line) => !/(로그인|회원가입|네이버페이|N\s*pay|공유|신고|인쇄|관심|알림)/i.test(line))
      .filter((line) => {
        if (seen.has(line)) return false;
        seen.add(line);
        return true;
      });
  }

  function truncate(value, max = 500) {
    const text = normalizeText(value);
    return text.length > max ? `${text.slice(0, max).trim()}...` : text;
  }

  function unique(items) {
    const seen = new Set();
    return (items || [])
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .filter((item) => {
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function cleanNumber(value) {
    const match = String(value || "").replaceAll(",", "").match(/[\d.]+/);
    return match?.[0] || "";
  }

  function moneyToManwon(value) {
    const text = normalizeText(value).replaceAll(",", "");
    if (!text || /협의|확인|미정|문의/.test(text)) return "";

    const eokMatch = text.match(/([\d.]+)\s*억/);
    if (eokMatch) {
      const eok = Number(eokMatch[1]) || 0;
      const restText = text.slice(eokMatch.index + eokMatch[0].length);
      const restMatch = restText.match(/([\d.]+)\s*(?:만|만원)?/);
      const rest = Number(restMatch?.[1]) || 0;
      return String(Math.round(eok * 10000 + rest));
    }

    return cleanNumber(text);
  }

  function firstRegex(text, patterns) {
    for (const pattern of patterns) {
      const match = String(text || "").match(pattern);
      if (match?.[1]) return normalizeText(match[1]);
    }
    return "";
  }

  function makePairTable(snapshot) {
    const table = {};
    for (const pair of Array.isArray(snapshot?.pairs) ? snapshot.pairs : []) {
      const key = normalizeText(pair?.key).replace(/:$/, "");
      const value = normalizeText(pair?.value);
      if (key && value && !table[key]) table[key] = value;
    }
    return table;
  }

  function findByAliases(table, aliases) {
    for (const [key, value] of Object.entries(table || {})) {
      if (aliases.some((alias) => key.includes(alias))) return normalizeText(value);
    }
    return "";
  }

  function inferTitle(text, table, snapshotTitle) {
    const direct = findByAliases(table, ["매물명", "단지명", "건물명", "상호", "매물"]);
    if (direct) return direct;

    const lines = normalizeLines(text)
      .filter((line) => line.length >= 3 && line.length <= 48)
      .filter((line) => !/(가격|월세|전세|매매|보증금|면적|주소|층수|관리비|확인|네이버|지도|목록)/.test(line));

    return lines[0] || normalizeText(snapshotTitle).replace(/\s*[:|-]\s*네이버.*$/i, "").slice(0, 48);
  }

  function extractAddress(text, table) {
    const direct = findByAliases(table, ["주소", "소재지", "위치", "지역"]);
    const matched = direct || firstRegex(text, [
      /((?:서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]{6,90})/,
    ]);
    return truncate(matched, 90);
  }

  function extractPrice(text, table, parsed = {}) {
    const raw =
      normalizeText(parsed.price_text) ||
      findByAliases(table, ["가격", "매매가", "전세가", "보증금", "월세", "매매", "전세"]) ||
      firstRegex(text, [
        /(월세\s*[\d,.]+(?:억)?(?:\s*[\d,.]+)?\s*\/\s*[\d,.]+)/,
        /(보증금\s*[\d,.]+(?:억)?(?:\s*[\d,.]+)?\s*\/\s*[\d,.]+)/,
        /(전세\s*[\d,.]+(?:억)?(?:\s*[\d,.]+)?)/,
        /(매매\s*[\d,.]+(?:억)?(?:\s*[\d,.]+)?)/,
        /(\d+(?:억)?(?:\s*[\d,.]+)?\s*\/\s*\d+[\d,.]*)/,
      ]);

    const transactionType =
      normalizeText(parsed.deal_type) ||
      (/매매/.test(raw) ? "매매" : /전세/.test(raw) ? "전세" : /월세|보증금|\//.test(raw) ? "월세" : "");

    const cleaned = raw.replace(/가격|보증금|월세|전세|매매|만원|원/g, " ");
    const parts = cleaned.split("/").map((part) => moneyToManwon(part));
    const salePrice = transactionType === "매매" ? moneyToManwon(raw) : "";
    const jeonsePrice = transactionType === "전세" ? moneyToManwon(raw) : "";
    const deposit = transactionType === "월세" ? parts[0] || moneyToManwon(raw) : jeonsePrice || salePrice;
    const monthlyRent = transactionType === "월세" ? parts[1] || "" : "";
    const maintenanceFee =
      moneyToManwon(parsed.maintenance_fee) ||
      moneyToManwon(findByAliases(table, ["관리비"])) ||
      moneyToManwon(firstRegex(text, [/관리비\s*([\d,.]+(?:억)?(?:\s*만원)?)/]));

    return {
      raw,
      transactionType,
      deposit,
      monthlyRent,
      salePrice,
      jeonsePrice,
      maintenanceFee,
    };
  }

  function extractArea(text, table, parsed = {}) {
    const areaRaw =
      normalizeText(parsed.area_text) ||
      findByAliases(table, ["계약면적", "공급면적", "전용면적", "면적"]) ||
      firstRegex(text, [
        /((?:공급|계약|전용)\s*[\d,.]+\s*(?:㎡|m²|m2|평)[^\n]{0,50})/,
        /([\d,.]+\s*(?:㎡|m²|m2|평)\s*\/\s*[\d,.]+\s*(?:㎡|m²|m2|평))/,
      ]);

    const supplyArea =
      cleanNumber(parsed.supply_area) ||
      cleanNumber(findByAliases(table, ["공급면적", "계약면적"])) ||
      firstRegex(areaRaw, [/(?:공급|계약)\s*([\d,.]+)/]) ||
      firstRegex(text, [/(?:공급|계약)면적\s*([\d,.]+)/]);
    const exclusiveArea =
      cleanNumber(parsed.exclusive_area) ||
      cleanNumber(findByAliases(table, ["전용면적"])) ||
      firstRegex(areaRaw, [/전용\s*([\d,.]+)/]) ||
      firstRegex(text, [/전용(?:면적)?\s*([\d,.]+)/]);

    return { areaRaw, supplyArea, exclusiveArea };
  }

  function normalizeParking(value) {
    const text = normalizeText(value);
    if (!text) return "";
    if (/불가|없음|무|불가능/.test(text)) return "불가";
    if (/가능|무료|유료|자주|기계|대|협의/.test(text)) return text;
    return text.slice(0, 60);
  }

  function normalizeElevator(value) {
    const text = normalizeText(value);
    if (!text) return "";
    if (/없음|무|불가|미설치/.test(text)) return "없음";
    if (/있음|유|가능|설치/.test(text)) return "있음";
    return text.slice(0, 40);
  }

  function extractOptionList(text, table) {
    const raw = [
      findByAliases(table, ["옵션", "특징", "시설", "매물특징"]),
      firstRegex(text, [/옵션\s*([^\n]{3,120})/]),
      firstRegex(text, [/특징\s*([^\n]{3,120})/]),
    ].filter(Boolean).join(", ");
    return unique(raw.split(/[,/·|]/)).slice(0, 12);
  }

  function confidenceValue(value) {
    if (!normalizeText(value)) return "missing";
    return "medium";
  }

  function buildMissingFields(property) {
    const missing = [];
    if (!property.title) missing.push(FIELD_LABELS.title);
    if (!property.priceRaw && !property.deposit && !property.salePrice && !property.jeonsePrice) missing.push(FIELD_LABELS.price);
    if (!property.supplyArea && !property.exclusiveArea) missing.push(FIELD_LABELS.area);
    if (!property.address) missing.push(FIELD_LABELS.address);
    if (!property.parking) missing.push(FIELD_LABELS.parking);
    if (!property.elevator) missing.push(FIELD_LABELS.elevator);
    if (!property.moveInDate) missing.push(FIELD_LABELS.moveInDate);
    return unique(missing);
  }

  function buildPropertyFromSnapshot(snapshot) {
    const parsed = snapshot?.parsed_fields || {};
    const table = makePairTable(snapshot);
    const text = [snapshot?.focused_text, snapshot?.visible_text, ...(snapshot?.panel_texts || [])].filter(Boolean).join("\n");
    const title = inferTitle(text, table, snapshot?.title || snapshot?.page_title);
    const price = extractPrice(text, table, parsed);
    const area = extractArea(text, table, parsed);
    const address = extractAddress(text, table);
    const propertyType =
      normalizeText(parsed.property_type) ||
      findByAliases(table, ["매물유형", "건물유형", "용도", "종류"]) ||
      firstRegex(text, [/(상가|사무실|오피스텔|아파트|빌딩|주택|원룸|공장|창고)/]);
    const floor =
      normalizeText(parsed.floor) ||
      findByAliases(table, ["층수", "해당층", "층"]) ||
      firstRegex(text, [/(\d+\s*층\s*\/\s*\d+\s*층|지하\s*\d+\s*층|저층|중층|고층|\d+\s*층)/]);
    const parking = normalizeParking(
      normalizeText(parsed.parking) ||
        findByAliases(table, ["주차", "주차가능여부"]) ||
        firstRegex(text, [/(주차\s*(?:가능|불가|무료|유료|협의|[0-9,]+대)[^\n]{0,30})/]),
    );
    const elevator = normalizeElevator(
      normalizeText(parsed.elevator) ||
        findByAliases(table, ["엘리베이터", "승강기"]) ||
        firstRegex(text, [/(엘리베이터\s*(?:있음|없음|유|무|가능|불가))/]),
    );
    const moveInDate =
      normalizeText(parsed.move_in_date || parsed.available_from) ||
      findByAliases(table, ["입주가능일", "입주 가능일", "입주"]) ||
      firstRegex(text, [/(즉시\s*입주|입주\s*협의|협의\s*입주|[0-9]{4}[.-][0-9]{1,2}[.-][0-9]{1,2})/]);
    const direction =
      normalizeText(parsed.direction) ||
      findByAliases(table, ["방향"]) ||
      firstRegex(text, [/(남향|동향|서향|북향|남동향|남서향|북동향|북서향)/]);
    const rooms = normalizeText(parsed.rooms) || firstRegex(text, [/방\s*([0-9]+)개/]);
    const bathrooms = normalizeText(parsed.bathrooms) || firstRegex(text, [/욕실\s*([0-9]+)개/]);
    const options = extractOptionList(text, table);
    const description = truncate(
      normalizeText(parsed.description) ||
        findByAliases(table, ["설명", "상세설명", "매물설명"]) ||
        normalizeLines(text).slice(0, 8).join(" / "),
      700,
    );
    const imageUrls = unique((snapshot?.images || []).map((image) => image?.url)).slice(0, 12);

    const property = {
      title,
      transactionType: price.transactionType,
      propertyType,
      address,
      priceRaw: price.raw,
      deposit: price.deposit,
      monthlyRent: price.monthlyRent,
      salePrice: price.salePrice,
      jeonsePrice: price.jeonsePrice,
      maintenanceFee: price.maintenanceFee,
      supplyArea: area.supplyArea,
      exclusiveArea: area.exclusiveArea,
      areaRaw: area.areaRaw,
      floor,
      rooms,
      bathrooms,
      parking,
      elevator,
      moveInDate,
      direction,
      options,
      description,
      imageUrls,
    };
    property.missingFields = buildMissingFields(property);
    return property;
  }

  function buildParsedFields(property, previous = {}) {
    return {
      ...previous,
      title: property.title || previous.title || "",
      deal_type: property.transactionType || previous.deal_type || "",
      property_type: property.propertyType || previous.property_type || "",
      price_text: property.priceRaw || previous.price_text || "",
      deposit: property.deposit || previous.deposit || "",
      monthly_rent: property.monthlyRent || previous.monthly_rent || "",
      sale_price: property.salePrice || previous.sale_price || "",
      jeonse_price: property.jeonsePrice || previous.jeonse_price || "",
      maintenance_fee: property.maintenanceFee || previous.maintenance_fee || "",
      address: property.address || previous.address || "",
      area_text: property.areaRaw || previous.area_text || "",
      supply_area: property.supplyArea || previous.supply_area || "",
      exclusive_area: property.exclusiveArea || previous.exclusive_area || "",
      floor: property.floor || previous.floor || "",
      rooms: property.rooms || previous.rooms || "",
      bathrooms: property.bathrooms || previous.bathrooms || "",
      parking: property.parking || previous.parking || "",
      elevator: property.elevator || previous.elevator || "",
      available_from: property.moveInDate || previous.available_from || "",
      move_in_date: property.moveInDate || previous.move_in_date || "",
      direction: property.direction || previous.direction || "",
      options: property.options?.join(", ") || previous.options || "",
      description: property.description || previous.description || "",
    };
  }

  function enrichSnapshot(snapshot) {
    const property = buildPropertyFromSnapshot(snapshot || {});
    const missingFields = property.missingFields || [];
    const confidence = {
      title: confidenceValue(property.title),
      price: confidenceValue(property.priceRaw || property.deposit || property.salePrice || property.jeonsePrice),
      area: confidenceValue(property.supplyArea || property.exclusiveArea),
      address: confidenceValue(property.address),
      parking: confidenceValue(property.parking),
      elevator: confidenceValue(property.elevator),
      moveInDate: confidenceValue(property.moveInDate),
    };

    return {
      ...(snapshot || {}),
      source: "naver_real_estate",
      sourceUrl: snapshot?.listing_url || snapshot?.sourceUrl || "",
      importedAt: new Date().toISOString(),
      confidence,
      property,
      missingFields,
      parsed_fields: buildParsedFields(property, snapshot?.parsed_fields || {}),
    };
  }

  const api = {
    normalizeText,
    normalizeLines,
    moneyToManwon,
    buildPropertyFromSnapshot,
    enrichSnapshot,
  };

  global.AgentNoteNaverExtractor = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
