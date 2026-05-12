import { useEffect, useMemo, useRef, useState } from "react";
import { importNaverListing } from "../../api";
import { useAuth } from "../../auth/AuthContext";

const NAVER_LAND_URL = "https://new.land.naver.com/";
const EXTENSION_DOWNLOAD_URL = "/downloads/real-estate-mvp-extension.zip";
const PRICE_NOISE_TOKENS = ["허위매물", "신고", "인쇄", "공유", "상담", "문의", "중개사", "등록"];

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripPriceNoise(value) {
  let text = normalize(value);
  for (const token of PRICE_NOISE_TOKENS) {
    text = text.replaceAll(token, " ");
  }
  return normalize(text);
}

function extractNaverLandUrl(value) {
  const trimmed = normalize(value);
  const match = trimmed.match(/https?:\/\/(?:new\.)?land\.naver\.com[^\s"'<>)]*/i);
  return match?.[0] || trimmed;
}

function firstRegex(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalize(match[1]);
  }
  return "";
}

function findByAliases(table, aliases) {
  for (const [key, value] of Object.entries(table)) {
    if (aliases.some((alias) => key.includes(alias))) return normalize(value);
  }
  return "";
}

function makePairTable(snapshot) {
  const table = {};
  const pairs = Array.isArray(snapshot?.pairs) ? snapshot.pairs : [];
  for (const pair of pairs) {
    const key = normalize(pair.key);
    const value = normalize(pair.value);
    if (key && value && !table[key]) table[key] = value;
  }
  return table;
}

function cleanNumber(value) {
  const match = String(value || "").match(/[\d,.]+/);
  return match ? match[0].replaceAll(",", "") : "";
}

function isMeaningfulNumber(value) {
  return Boolean(cleanNumber(value));
}

function moneyToManwon(value) {
  const text = stripPriceNoise(value).replaceAll(",", "");
  const eokMatch = text.match(/([\d.]+)\s*억/);
  if (eokMatch) {
    const eok = Number(eokMatch[1]) || 0;
    const afterEok = text.slice(eokMatch.index + eokMatch[0].length);
    const restMatch = afterEok.match(/([\d.]+)/);
    return String(Math.round(eok * 10000 + (Number(restMatch?.[1]) || 0)));
  }
  return cleanNumber(text);
}

function normalizeAddress(value) {
  const text = normalize(value);
  if (!text) return "";

  const addressMatch = text.match(/((?:서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]{6,80})/);
  return normalize(addressMatch?.[1] || text.slice(0, 80));
}

function extractPrice(text, table, parsed) {
  return (
    stripPriceNoise(parsed?.price_text) ||
    findByAliases(table, ["가격", "매매가", "전세가", "보증금", "월세", "매매", "전세"]) ||
    firstRegex(text, [
      /(월세\s*[\d,.]+(?:억)?(?:\s*\/\s*[\d,.]+)?)/,
      /(보증금\s*[\d,.]+(?:억)?(?:\s*\/\s*[\d,.]+)?)/,
      /(전세\s*[\d,.]+(?:억)?)/,
      /(매매\s*[\d,.]+(?:억)?)/,
      /(\d+억\s*\d*[\d,.]*\s*\/\s*\d+[\d,.]*)/,
    ])
  );
}

function extractPremium(text, table, parsed) {
  return (
    cleanNumber(parsed?.premium) ||
    cleanNumber(findByAliases(table, ["권리금"])) ||
    firstRegex(text, [/권리금\s*([\d,.]+)/])
  );
}

function extractSimpleField(text, table, parsedValue, aliases, regexes = []) {
  return (
    normalize(parsedValue) ||
    findByAliases(table, aliases) ||
    firstRegex(text, regexes)
  );
}

function extractArea(text, table, parsed) {
  const areaText =
    normalize(parsed?.area_text) ||
    findByAliases(table, ["계약면적", "공급면적", "전용면적", "면적"]) ||
    firstRegex(text, [
      /((?:공급|계약|전용)\s*[\d,.]+\s*(?:㎡|m²|m2)[^\n]{0,24})/,
      /(([\d,.]+\s*(?:㎡|m²|m2)\s*\/\s*[\d,.]+\s*(?:㎡|m²|m2)))/,
    ]);

  return {
    areaText,
    supplyArea:
      cleanNumber(parsed?.supply_area) ||
      firstRegex(areaText, [/(?:공급|계약)\s*([\d,.]+)/]) ||
      firstRegex(text, [/(?:공급|계약)면적\s*([\d,.]+)/]),
    exclusiveArea:
      cleanNumber(parsed?.exclusive_area) ||
      firstRegex(areaText, [/전용\s*([\d,.]+)/]) ||
      firstRegex(text, [/전용(?:면적)?\s*([\d,.]+)/]),
  };
}

function pickTitle(text, table, parsed) {
  const direct =
    normalize(parsed?.title) ||
    findByAliases(table, ["매물명", "단지명", "건물명", "매물", "상호"]);
  if (direct) return direct;

  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => normalize(line))
    .filter(Boolean)
    .filter((line) => line.length >= 2 && line.length <= 40)
    .filter((line) => !/[/:]/.test(line))
    .filter((line) => !/(네이버|로그인|회원가입|필터|지도|목록|바로가기|메일|알림|프로필|pay)/i.test(line));

  return lines[0] || "네이버 매물 초안";
}

function isBadImageCandidate(image) {
  const url = String(image?.url || "").toLowerCase();
  const alt = String(image?.alt || "").toLowerCase();
  const haystack = `${url} ${alt}`;

  if (!url.startsWith("http")) return true;

  return [
    "sprite",
    "sp_",
    "favicon",
    "logo",
    "profile",
    "avatar",
    "default",
    "blank",
    "icon",
    "marker",
    "map",
    "npay",
    "pay",
    "banner",
    "gnb",
    "talk",
  ].some((token) => haystack.includes(token));
}

function buildLocalDraftFromSnapshot(snapshot) {
  const parsed = snapshot?.parsed_fields || {};
  const structured = snapshot?.property || {};
  const table = makePairTable(snapshot);
  const text = normalize(snapshot?.focused_text || snapshot?.visible_text);
  const importedMissingFields = Array.isArray(snapshot?.missingFields) ? snapshot.missingFields : [];

  const title = normalize(structured.title) || pickTitle(text, table, parsed);
  const priceText = stripPriceNoise(normalize(structured.priceRaw) || extractPrice(text, table, parsed));
  const dealType =
    normalize(structured.transactionType) ||
    normalize(parsed?.deal_type) ||
    (priceText.includes("전세") ? "전세" : priceText.includes("매매") ? "매매" : "월세");

  const parsedDeposit = cleanNumber(structured.deposit) || cleanNumber(parsed?.deposit);
  const parsedMonthlyRent = cleanNumber(structured.monthlyRent) || cleanNumber(parsed?.monthly_rent);
  const parsedMaintenanceFee = cleanNumber(structured.maintenanceFee) || cleanNumber(parsed?.maintenance_fee);
  const deposit =
    parsedDeposit ||
    (dealType === "월세" ? moneyToManwon(priceText.split("/")[0]) : moneyToManwon(priceText));
  const monthlyRent =
    parsedMonthlyRent ||
    (dealType === "월세" ? moneyToManwon(priceText.split("/")[1] || "") : "");
  const maintenanceFee =
    parsedMaintenanceFee ||
    cleanNumber(findByAliases(table, ["관리비"])) ||
    firstRegex(text, [/관리비\s*([\d,.]+)/]);
  const premium = extractPremium(text, table, parsed);

  const address = normalizeAddress(
    normalize(structured.address) ||
      normalize(parsed?.address) ||
      findByAliases(table, ["주소", "소재지", "위치"]) ||
      firstRegex(text, [
        /((?:서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]{6,80})/,
      ])
  );

  const { areaText, supplyArea, exclusiveArea } = extractArea(text, table, {
    ...parsed,
    area_text: structured.areaRaw || parsed.area_text,
    supply_area: structured.supplyArea || parsed.supply_area,
    exclusive_area: structured.exclusiveArea || parsed.exclusive_area,
  });
  const floor =
    normalize(structured.floor) ||
    normalize(parsed?.floor) ||
    findByAliases(table, ["층수", "해당층", "층"]) ||
    firstRegex(text, [/(\d+\s*층\s*\/\s*\d+\s*층|\d+\s*층|저층|중층|고층)/]);
  const parking =
    normalize(structured.parking) ||
    normalize(parsed?.parking) ||
    findByAliases(table, ["주차", "주차가능여부"]) ||
    firstRegex(text, [/(주차\s*(?:가능|불가|무료|유료|[\d,]+대))/]);
  const elevator = normalize(structured.elevator) || normalize(parsed?.elevator) || findByAliases(table, ["엘리베이터", "승강기"]);
  const restroom = extractSimpleField(text, table, parsed?.restroom, ["화장실", "화장실위치", "화장실 형태"], [/(내부 화장실|외부 화장실|남녀분리|층별 공용)/]);
  const availableFrom = normalize(structured.moveInDate) || extractSimpleField(text, table, parsed?.available_from, ["입주가능일", "입주 가능일"], [/(즉시입주|즉시 입주|협의 입주|입주 협의)/]);
  const hvac = extractSimpleField(text, table, parsed?.hvac, ["냉난방", "난방", "냉방"], [/(개별냉난방|중앙냉난방|시스템냉난방|천장형 냉난방)/]);
  const maintenanceIncludes = extractSimpleField(
    text,
    table,
    parsed?.maintenance_includes,
    ["관리비포함", "관리비 포함", "포함항목", "포함 내역"],
    [/(관리비\s*포함[^.\n]{0,40})/]
  );
  const recommendedIndustry = extractSimpleField(
    text,
    table,
    parsed?.recommended_industry,
    ["추천업종", "가능업종", "업종"],
    [/(사무실|예약제 업종|상담형 업종|소형 사무실|학원|병원|뷰티|쇼룸)/]
  );
  const signAllowed = extractSimpleField(
    text,
    table,
    parsed?.sign_allowed,
    ["간판", "간판가능", "간판 가능"],
    [/(간판\s*(?:가능|협의 가능|불가))/]
  );
  const cautionNotes = [maintenanceIncludes ? "" : "관리비 포함 항목 확인 필요", !premium && /권리금/.test(text) ? "권리금 협의 여부 확인 필요" : ""]
    .filter(Boolean)
    .join(", ");

  let priceStatus = "missing";
  if (dealType === "월세") {
    if (deposit && monthlyRent) {
      priceStatus = "ok";
    } else if (deposit || monthlyRent) {
      priceStatus = "partial";
    } else if (maintenanceFee || premium) {
      priceStatus = "manual_required";
    }
  } else if (deposit) {
    priceStatus = "ok";
  } else if (maintenanceFee || premium) {
    priceStatus = "manual_required";
  }

  const structuredImages = Array.isArray(structured.imageUrls)
    ? structured.imageUrls.map((url) => ({ url, source: "naver_real_estate" }))
    : [];
  const images = ([...(Array.isArray(snapshot?.images) ? snapshot.images : []), ...structuredImages])
    .filter((image) => !isBadImageCandidate(image))
    .slice(0, 4)
    .map((image, index) => ({
      ...image,
      alt: "",
      category: index === 0 ? "대표 후보" : "매물 사진 후보",
      confidence: image.confidence || 0.6,
    }));

  const summaryLines = [];
  if (address) summaryLines.push(address);
  if (areaText) summaryLines.push(areaText);
  if (floor) summaryLines.push(`${floor} 기준`);
  if (parking) summaryLines.push(`주차 ${parking}`);

  const description = [
    title && title !== "네이버 매물 초안" ? `${title} 소개 초안` : "매물 소개 초안",
    summaryLines.length ? summaryLines.join(" · ") : "",
    priceText ? `가격 정보: ${priceText}` : "가격 정보는 확인 후 입력해 주세요.",
    recommendedIndustry ? `추천 업종: ${recommendedIndustry}` : "",
    availableFrom ? `입주 가능일: ${availableFrom}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const fieldMapping = {
    title,
    deal_type: dealType,
    address,
    supply_area: cleanNumber(supplyArea),
    exclusive_area: cleanNumber(exclusiveArea),
    floor,
    premium,
    deposit,
    monthly_rent: monthlyRent,
    maintenance_fee: maintenanceFee,
    price_status: priceStatus,
    elevator: /없음|무|불가/.test(elevator) ? "없음" : elevator ? "있음" : "",
    parking_count: cleanNumber(parking) || parking,
    restroom_detail: restroom,
    move_in_date: availableFrom,
    hvac,
    admin_fee_includes: maintenanceIncludes,
    recommended_use: recommendedIndustry,
    sign_allowed: signAllowed,
    special_notes: cautionNotes,
    description,
  };

  const warnings = [];
  if (!priceText || (!isMeaningfulNumber(deposit) && !isMeaningfulNumber(monthlyRent))) {
    warnings.push("가격을 정확히 읽지 못했습니다. 가격은 자동 반영하지 않았으니 직접 확인해 주세요.");
  }
  if (!address) warnings.push("주소를 읽지 못했습니다. 상세 정보 패널에서 주소가 보이는지 먼저 확인해 주세요.");
  if (!areaText && !supplyArea && !exclusiveArea) warnings.push("면적을 읽지 못했습니다. 공급면적이나 전용면적이 보이는 상태에서 다시 가져와 주세요.");
  if (images.length === 0) warnings.push("사진을 찾지 못했습니다. 네이버 사진 탭을 연 상태에서 다시 가져오면 더 잘 잡힙니다.");
  importedMissingFields.forEach((field) => warnings.push(field));

  return {
    brochure_title: title,
    summary_points: [address, priceText, areaText, floor].filter(Boolean),
    description,
    field_mapping: Object.fromEntries(
      Object.entries(fieldMapping).filter(([, value]) => normalize(value))
    ),
    recommended_images: images,
    warnings: Array.from(new Set(warnings)).slice(0, 8),
    missing_fields: importedMissingFields,
    confidence: snapshot?.confidence || {},
    source: "extension-local",
  };
}

function makeCoverage(draft) {
  const fields = draft?.field_mapping || {};
  const images = draft?.recommended_images || [];
  return [
    { key: "title", label: "매물명", ok: Boolean(fields.title), value: fields.title },
    {
      key: "price",
      label: "가격",
      ok: Boolean(fields.deposit || fields.monthly_rent),
      value: fields.monthly_rent ? `${fields.deposit}/${fields.monthly_rent}` : fields.deposit,
    },
    { key: "address", label: "주소", ok: Boolean(fields.address), value: fields.address },
    {
      key: "area",
      label: "면적",
      ok: Boolean(fields.supply_area || fields.exclusive_area),
      value: fields.exclusive_area || fields.supply_area,
    },
    { key: "floor", label: "층수", ok: Boolean(fields.floor), value: fields.floor },
    { key: "images", label: "사진", ok: images.length > 0, value: images.length ? `${images.length}장` : "" },
  ];
}

function NaverImportPanel({ initialUrl = "", initialSnapshot = null, onApplyDraft }) {
  const [listingUrl, setListingUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [localDraft, setLocalDraft] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTab, setHelpTab] = useState("extension");
  const [extensionPathCopied, setExtensionPathCopied] = useState(false);
  const [handledSnapshotKey, setHandledSnapshotKey] = useState("");
  const { isAuthenticated } = useAuth();
  const helpRef = useRef(null);

  const activeDraft = result?.brochure_draft || localDraft;
  const images = activeDraft?.recommended_images || [];
  const missingFields = activeDraft?.missing_fields || [];
  const coverage = useMemo(() => makeCoverage(activeDraft), [activeDraft]);

  const snapshotStats = useMemo(() => {
    if (!initialSnapshot?.listing_url) return null;
    return {
      pairs: initialSnapshot.pairs?.length || 0,
      images: initialSnapshot.images?.length || 0,
      textLength: (initialSnapshot.focused_text || initialSnapshot.visible_text || "").length,
      parsed: Object.values(initialSnapshot.parsed_fields || {}).filter(Boolean).length,
      missing: initialSnapshot.missingFields?.length || 0,
    };
  }, [initialSnapshot]);

  useEffect(() => {
    if (!initialUrl) return;
    setListingUrl(extractNaverLandUrl(initialUrl));
    setError("");
  }, [initialUrl]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!helpRef.current?.contains(event.target)) {
        setHelpOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!initialSnapshot?.listing_url) return;

    const snapshotKey = [
      initialSnapshot.listing_url,
      initialSnapshot.received_at || "",
      initialSnapshot.focused_text?.length || initialSnapshot.visible_text?.length || 0,
      initialSnapshot.images?.length || 0,
      initialSnapshot.pairs?.length || 0,
    ].join(":");

    if (handledSnapshotKey === snapshotKey) return;

    let fallbackDraft = null;
    try {
      fallbackDraft = buildLocalDraftFromSnapshot(initialSnapshot);
    } catch (err) {
      console.error(err);
      setError("가져온 매물 데이터를 정리하는 중 오류가 발생했습니다. 사진 패널을 닫고 다시 시도해 주세요.");
      return;
    }

    setHandledSnapshotKey(snapshotKey);
    setListingUrl(extractNaverLandUrl(initialSnapshot.listing_url));
    setLocalDraft(fallbackDraft);
    setResult(null);
    setError("");
    setStatus(
      fallbackDraft.missing_fields?.length
        ? "일부 정보만 가져왔습니다. 가격, 면적 등 누락된 항목을 확인해 주세요."
        : "네이버 부동산 매물 정보를 가져왔습니다. 누락된 항목을 확인해 주세요."
    );
    try {
      onApplyDraft?.(fallbackDraft);
    } catch (applyError) {
      console.error(applyError);
      setError("가져온 값을 폼에 반영하는 중 오류가 발생했습니다. 세부 사진 패널을 닫고 다시 시도해 주세요.");
    }
  }, [initialSnapshot, handledSnapshotKey, onApplyDraft]);

  const openNaverLand = () => {
    window.open(NAVER_LAND_URL, "_blank", "noopener,noreferrer");
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setListingUrl(extractNaverLandUrl(text));
      setError("");
    } catch {
      setError("브라우저가 클립보드 읽기를 막고 있습니다. 복사한 URL을 직접 붙여넣어 주세요.");
    }
  };

  const handleUrlImport = async () => {
    if (!isAuthenticated) {
      setError("URL 가져오기는 로그인 후 사용할 수 있습니다.");
      return;
    }

    const normalizedUrl = extractNaverLandUrl(listingUrl);
    if (!normalizedUrl) {
      setError("네이버 부동산 매물 URL을 입력해 주세요.");
      return;
    }

    if (!normalizedUrl.includes("land.naver.com")) {
      setError("현재는 네이버 부동산 URL만 가져올 수 있습니다.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setListingUrl(normalizedUrl);
      const data = await importNaverListing(normalizedUrl);
      setResult(data);
      setLocalDraft(null);
      if (data?.brochure_draft) {
        try {
          onApplyDraft?.(data.brochure_draft);
        } catch (applyError) {
          console.error(applyError);
          setError("가져온 값을 폼에 반영하는 중 오류가 발생했습니다. 사진 패널을 닫고 다시 시도해 주세요.");
        }
      }
    } catch (err) {
      console.error(err);
      setError(
        `${err.message || "URL 가져오기 중 오류가 발생했습니다."} URL 직접 입력 방식은 네이버 차단/CORS 때문에 실패할 수 있습니다. 가장 안정적인 방법은 네이버 화면의 '업무툴로 가져오기' 버튼입니다.`
      );
    } finally {
      setLoading(false);
    }
  };

  const copyExtensionsPath = async () => {
    try {
      await navigator.clipboard.writeText("chrome://extensions/");
      setExtensionPathCopied(true);
      window.setTimeout(() => setExtensionPathCopied(false), 1800);
    } catch {
      setExtensionPathCopied(false);
    }
  };

  return (
    <section className="import-panel import-panel-compact import-panel-drawer">
      <details className="naver-import-drawer">
        <summary className="naver-import-summary">
          <span>네이버 매물 가져오기</span>
          <em>크롬 확장 필요</em>
        </summary>
        <div className="naver-import-body">
      <div className="panel-head import-panel-head">
        <div>
          <h3>크롬 확장으로 네이버 매물 가져오기</h3>
          <p>네이버 매물 화면에서 업무툴로 가져오기를 누르면 소개서 입력값에 바로 반영됩니다.</p>
        </div>
        <div className="import-head-actions" ref={helpRef}>
          <button
            type="button"
            className="import-help-trigger"
            onClick={() => {
              setHelpTab("extension");
              setHelpOpen((prev) => !prev);
            }}
            aria-label="네이버 매물 가져오기 안내"
            aria-expanded={helpOpen}
          >
            가이드
          </button>

        </div>
      </div>

      {helpOpen && (
        <div className="import-help-popover import-help-panel">
          <strong>처음 쓰는 분 가이드</strong>
          <div className="import-help-tabs">
            <button
              type="button"
              className={`import-help-tab ${helpTab === "extension" ? "active" : ""}`}
              onClick={() => setHelpTab("extension")}
            >
              크롬 확장 설정
            </button>
            <button
              type="button"
              className={`import-help-tab ${helpTab === "usage" ? "active" : ""}`}
              onClick={() => setHelpTab("usage")}
            >
              사용 방법
            </button>
          </div>
          <div className="import-help-body">
            {helpTab === "extension" ? (
              <>
                <div className="import-help-actions">
                  <a
                    className="import-help-download"
                    href={EXTENSION_DOWNLOAD_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    확장 ZIP 다운로드
                  </a>
                  <button
                    type="button"
                    className="import-help-copy"
                    onClick={copyExtensionsPath}
                  >
                    {extensionPathCopied ? "주소 복사됨" : "chrome://extensions 복사"}
                  </button>
                </div>

                <div className="import-help-section">
                  <span className="import-help-kicker">먼저 알아둘 점</span>
                  <p>
                    웹앱에서는 <code>chrome://extensions</code> 주소를 바로 열지 못할 수 있습니다.
                    그래서 위 버튼으로 주소를 복사한 뒤, 크롬 주소창에 붙여넣는 방식이 가장 안정적입니다.
                  </p>
                </div>

                <div className="import-help-section">
                  <span className="import-help-kicker">처음 한 번만</span>
                  <ol className="import-help-list import-help-list-clean">
                    <li>위에서 확장 ZIP을 내려받습니다.</li>
                    <li>내려받은 ZIP 파일의 압축을 풉니다.</li>
                    <li><code>chrome://extensions</code> 주소를 복사해서 크롬 주소창에 붙여넣고 이동합니다.</li>
                    <li>오른쪽 위 개발자 모드를 켭니다.</li>
                    <li>왼쪽 위 압축해제된 확장 프로그램 로드를 누릅니다.</li>
                    <li>압축을 푼 폴더 안에 있는 <code>chrome-extension</code> 폴더를 선택합니다.</li>
                    <li>설치가 끝나면 네이버 부동산 탭을 새로고침합니다.</li>
                  </ol>
                </div>

                <div className="import-help-section">
                  <span className="import-help-kicker">설치 후 확인</span>
                  <ul className="import-help-list import-help-bullets">
                    <li>확장 목록에 업무툴 확장이 보여야 합니다.</li>
                    <li>네이버 화면 오른쪽 아래에 업무툴로 가져오기 버튼이 보여야 합니다.</li>
                    <li>버튼이 안 보이면 확장을 새로고침하고 네이버 탭도 다시 새로고침합니다.</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                <div className="import-help-section">
                  <span className="import-help-kicker">사용 순서</span>
                  <ol className="import-help-list import-help-list-clean">
                    <li>네이버 부동산에서 실제 매물 하나를 클릭합니다.</li>
                    <li>가격, 면적, 사진 등 상세 정보가 보이게 둡니다.</li>
                    <li>오른쪽 아래 업무툴로 가져오기 버튼을 누릅니다.</li>
                    <li>우리 앱으로 돌아와 자동으로 채워진 값을 검토한 뒤 저장합니다.</li>
                  </ol>
                </div>

                <div className="import-help-section">
                  <span className="import-help-kicker">버튼이 안 보일 때</span>
                  <ul className="import-help-list import-help-bullets">
                    <li>크롬 확장을 아직 설치하지 않았거나 꺼져 있는 경우</li>
                    <li>확장을 설치한 뒤 네이버 탭을 다시 새로고침하지 않은 경우</li>
                    <li>매물 상세 패널이 충분히 열려 있지 않은 경우</li>
                  </ul>
                </div>

                <p className="import-help-footnote">
                  가격이나 면적이 비어 있으면 네이버 쪽 상세 패널이 충분히 열려 있는지 먼저 확인해 주세요.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {snapshotStats && (
        <div className="import-debug-box">
          <strong>정제 수집 결과</strong>
          <span>필드 {snapshotStats.parsed}개</span>
          <span>표 후보 {snapshotStats.pairs}개</span>
          <span>이미지 후보 {snapshotStats.images}개</span>
          <span>화면 텍스트 {snapshotStats.textLength.toLocaleString()}자</span>
          <span>확인 필요 {snapshotStats.missing}개</span>
        </div>
      )}

      {activeDraft && (
        <div className="import-coverage-grid">
          {coverage.map((item) => (
            <div
              key={item.key}
              className={`coverage-item ${item.ok ? "ok" : "missing"}`}
              title={item.value || "비어 있음"}
            >
              <span>{item.label}</span>
              <strong>{item.ok ? "읽음" : "비어 있음"}</strong>
            </div>
          ))}
        </div>
      )}

      {missingFields.length > 0 && (
        <div className="import-missing-summary">
          <strong>확인 필요</strong>
          <div>
            {missingFields.slice(0, 6).map((field) => (
              <span key={field}>{field}</span>
            ))}
          </div>
        </div>
      )}

      {status && <div className="import-alert success">{status}</div>}

      <details className="url-fallback-box">
        <summary>
          <span>보조 URL 입력</span>
        </summary>
        <div className="url-fallback-intro">
          <p>
            네이버 차단/CORS 때문에 URL 직접 입력은 실패할 수 있습니다. 크롬 확장 버튼을 우선 사용해 주세요.
          </p>
          <div className="import-quick-actions">
            <button type="button" className="secondary-btn" onClick={openNaverLand}>
              네이버 부동산 열기
            </button>
            <button type="button" className="secondary-btn" onClick={pasteFromClipboard}>
              복사한 URL 붙여넣기
            </button>
          </div>
        </div>
        <div className="import-row">
          <input
            className="import-url-input"
            value={listingUrl}
            onChange={(e) => setListingUrl(e.target.value)}
            placeholder="https://new.land.naver.com/..."
          />
          <button
            type="button"
            className="cta-btn import-btn"
            onClick={handleUrlImport}
            disabled={loading}
          >
            {loading ? "불러오는 중..." : "URL로 가져오기"}
          </button>
        </div>
      </details>

      {error && <div className="import-alert danger">{error}</div>}

      {activeDraft && (
        <div className="import-result">
          <div className="import-result-top">
            <div>
              <strong>{activeDraft.brochure_title}</strong>
              <p>{activeDraft.summary_points?.join(" · ") || "읽은 값을 바탕으로 소개서 초안을 만들었습니다."}</p>
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => onApplyDraft?.(activeDraft)}
            >
              다시 반영
            </button>
          </div>

          {activeDraft.warnings?.length > 0 && (
            <div className="import-alert">
              {activeDraft.warnings.slice(0, 4).map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}

          {images.length > 0 && (
            <div className="import-image-strip">
              {images.slice(0, 8).map((image, index) => (
                <a
                  key={`${image.url}-${index}`}
                  href={image.url}
                  target="_blank"
                  rel="noreferrer"
                  className="import-image-item"
                >
                  <span>{image.category || `이미지 ${index + 1}`}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
        </div>
      </details>
    </section>
  );
}

export default NaverImportPanel;



