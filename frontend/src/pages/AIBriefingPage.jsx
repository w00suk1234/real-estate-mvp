import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { generateAiBriefing } from "../services/aiBriefingService";
import { listCustomers, listProperties, saveCustomer, saveSchedule } from "../services/supabaseRepository";
import {
  AI_BRIEFING_FOCUS_OPTIONS,
  formatAvailability,
  formatCustomerBudget,
  formatPropertyPrice,
  normalizeBriefingCustomer,
  normalizeBriefingProperty,
} from "../utils/aiBriefing";

const AI_BRIEFING_PREFILL_KEY = "agentnote_ai_briefing_prefill";
const AI_BRIEFING_DRAFT_KEY = "agentnote_ai_briefing_draft";
const AI_RECOMMEND_CUSTOMER_KEY = "agentnote_recommend_customer_id";
const AI_BROCHURE_DRAFT_KEY = "agentnote_ai_brochure_draft";
const AI_BRIEFING_RETURN_KEY = "agentnote_ai_briefing_return";
const DEFAULT_FOCUS = ["price", "location", "size"];

function parsePrefillIds(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function readBriefingPrefill() {
  const params = new URLSearchParams(window.location.search);
  let stored = {};

  try {
    stored = JSON.parse(localStorage.getItem(AI_BRIEFING_PREFILL_KEY) || "{}");
  } catch {
    stored = {};
  }

  return {
    customerId: params.get("customerId") || stored.customerId || "",
    propertyIds: parsePrefillIds(params.get("propertyIds") || (stored.propertyIds || []).join(",")),
  };
}

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function moneyLabel(value, suffix = "") {
  const amount = Number(value || 0);
  return amount ? `${amount.toLocaleString("ko-KR")}만원${suffix}` : "";
}

function buildCriteriaPayload(focus) {
  const selected = new Set(focus);
  return AI_BRIEFING_FOCUS_OPTIONS.filter((item) => selected.has(item.id)).map((item) => item.label);
}

function validFocusValues(values) {
  const allowed = new Set(AI_BRIEFING_FOCUS_OPTIONS.map((item) => item.id));
  const next = (Array.isArray(values) ? values : []).filter((item) => allowed.has(item));
  return next.length ? next : DEFAULT_FOCUS;
}

function buildCustomerPayload(customer, normalizedCustomer) {
  const budget = normalizedCustomer?.budget || {};
  const requiredConditions = normalizedCustomer?.requiredConditions || [];
  const memo = text(normalizedCustomer?.importantMemo || customer?.memo || customer?.wanted_condition);
  const parkingRequired = requiredConditions.some((condition) => text(condition).includes("주차")) || memo.includes("주차");
  return {
    name: text(customer?.name || normalizedCustomer?.displayName),
    desiredRegion: normalizedCustomer?.preferredAreas?.join(", ") || text(customer?.preferred_area || customer?.area),
    budget: formatCustomerBudget(normalizedCustomer),
    deposit: moneyLabel(budget.maxDeposit, " 이하"),
    monthlyRent: moneyLabel(budget.maxMonthlyRent, " 이하"),
    propertyType: text(normalizedCustomer?.purpose || customer?.property_type),
    minArea: normalizedCustomer?.minSizeM2 ? `${normalizedCustomer.minSizeM2}㎡ 이상` : "",
    parkingRequired,
    memo,
  };
}

function buildPropertyPayload(property, normalizedProperty) {
  const price = normalizedProperty?.price || {};
  return {
    id: text(property?.id || normalizedProperty?.id),
    title: text(normalizedProperty?.displayName),
    address: text(normalizedProperty?.addressOrArea),
    price: formatPropertyPrice(normalizedProperty),
    deposit: moneyLabel(price.deposit),
    monthlyRent: moneyLabel(price.monthlyRent),
    area: normalizedProperty?.sizeM2 ? `${normalizedProperty.sizeM2}㎡` : text(normalizedProperty?.sizeLabel),
    floor: text(normalizedProperty?.floor),
    parking: formatAvailability(normalizedProperty?.parking),
    elevator: formatAvailability(normalizedProperty?.elevator),
    moveInDate: text(normalizedProperty?.moveInDate),
    memo: text(normalizedProperty?.brokerMemo),
  };
}

function getTodayValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getDateStamp() {
  const now = new Date();
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
}

function appendDatedMemo(existingMemo, memo) {
  const prev = text(existingMemo);
  const next = text(memo);
  if (!next) return prev;
  const block = `[${getDateStamp()} AI 브리핑]\n${next}`;
  return prev ? `${prev}\n\n${block}` : block;
}

function getPrimaryRanking(result) {
  const ranking = Array.isArray(result?.ranking) ? result.ranking : [];
  return ranking.find((item) => item.isRecommended) || ranking[0] || null;
}

function buildActionMemo(result) {
  const checkPoints = Array.isArray(result?.checkPoints) ? result.checkPoints : [];
  return [
    result?.conditionNotice,
    result?.consultingMemo,
    checkPoints.length ? `추가 확인사항: ${checkPoints.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildScheduleMemo(result) {
  const ranking = Array.isArray(result?.ranking) ? result.ranking : [];
  const top = ranking[0];
  const checkPoints = Array.isArray(result?.checkPoints) ? result.checkPoints : [];
  return [
    top ? `우선 비교 후보: ${top.title} (${top.fitScore})` : "",
    result?.consultingMemo,
    checkPoints.length ? `확인 필요: ${checkPoints.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildBrochureDraftPayload(result, customer, properties) {
  const primaryRanking = getPrimaryRanking(result);
  const matchedProperty =
    properties.find((property) => String(property.id) === String(primaryRanking?.propertyId)) ||
    properties[0] ||
    null;
  if (!matchedProperty) return null;

  const normalized = normalizeBriefingProperty(matchedProperty);
  const normalizedCustomer = customer ? normalizeBriefingCustomer(customer) : null;
  const price = normalized.price || {};

  return {
    propertyId: normalized.id,
    source: "ai-briefing",
    form: {
      title: normalized.displayName,
      deal_type: normalized.dealType || "월세",
      deposit: price.deposit ? String(price.deposit) : "",
      monthly_rent: price.monthlyRent ? String(price.monthlyRent) : "",
      address: normalized.addressOrArea,
      supply_area: normalized.sizeM2 ? String(normalized.sizeM2) : "",
      exclusive_area: normalized.sizeM2 ? String(normalized.sizeM2) : "",
      floor: normalized.floor,
      elevator: formatAvailability(normalized.elevator),
      parking_count: formatAvailability(normalized.parking),
      recommended_use: normalizedCustomer?.purpose || "",
      move_in_date: normalized.moveInDate,
      special_notes: [normalized.brokerMemo, result?.consultingMemo].filter(Boolean).join("\n\n"),
      description: result?.recommendationSummary || "",
    },
  };
}

function buildRecommendedActions(result, customer, properties) {
  const customerName = text(customer?.name) || "고객";
  const actionMemo = buildActionMemo(result);
  const scheduleMemo = buildScheduleMemo(result);
  const brochurePayload = buildBrochureDraftPayload(result, customer, properties);
  const actions = [
    {
      type: "save_customer_memo",
      label: "고객 메모에 저장",
      description: "조건 미충족 및 추가 확인사항을 고객 메모에 날짜와 함께 남깁니다.",
      primary: true,
      payload: { memo: actionMemo },
    },
    {
      type: "create_schedule",
      label: "상담 일정 만들기",
      description: "조건 재확인 상담 일정을 오늘 10:00 미팅으로 등록합니다.",
      primary: true,
      payload: {
        title: `${customerName} 고객 조건 재확인 상담`,
        category: "미팅",
        memo: scheduleMemo,
      },
    },
    brochurePayload
      ? {
          type: "create_brochure",
          label: "소개서 초안 작성",
          description: "가장 가까운 후보 매물을 기준으로 소개서 작성 화면으로 이동합니다.",
          primary: true,
          payload: brochurePayload,
        }
      : null,
    {
      type: "find_more_properties",
      label: "추가 매물 찾기",
      description: "현재 고객 조건으로 AI 매물 추천기에서 추가 후보를 확인합니다.",
      primary: false,
      payload: { customerId: customer?.id || "" },
    },
    {
      type: "copy_customer_message",
      label: "고객 발송 문구 복사",
      description: "고객에게 보낼 수 있는 짧은 문구를 클립보드에 복사합니다.",
      primary: false,
      payload: { message: result?.customerMessage || "" },
    },
  ];

  return actions.filter(Boolean);
}

function readBriefingDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(AI_BRIEFING_DRAFT_KEY) || "null");
    return draft && typeof draft === "object" ? draft : null;
  } catch {
    return null;
  }
}

function stripResultForDraft(result) {
  if (!result) return null;
  const rest = { ...result };
  delete rest.actions;
  return rest;
}

function buildBriefingDraft({
  selectedCustomerId,
  selectedPropertyIds,
  focus,
  result,
  generatedAt,
  lastSelectedPropertyId,
  closestPropertyId,
  selectionMode,
}) {
  return {
    selectedCustomerId: text(selectedCustomerId),
    selectedPropertyIds: (Array.isArray(selectedPropertyIds) ? selectedPropertyIds : []).map(String).slice(0, 5),
    selectedCriteria: validFocusValues(focus),
    aiBriefingResult: stripResultForDraft(result),
    generatedAt: generatedAt || "",
    lastSelectedPropertyId: text(lastSelectedPropertyId),
    closestPropertyId: text(closestPropertyId),
    selectionMode: selectionMode === "auto" ? "auto" : "manual",
  };
}

function writeBriefingDraft(draft) {
  sessionStorage.setItem(AI_BRIEFING_DRAFT_KEY, JSON.stringify(draft));
}

function removeBriefingDraft() {
  sessionStorage.removeItem(AI_BRIEFING_DRAFT_KEY);
}

function booleanFromAvailability(value) {
  const source = text(value);
  if (!source || /확인|미입력|문의|협의|불명확/.test(source)) return null;
  if (/불가|없음|없습니다|안됨|무/.test(source)) return false;
  if (/가능|있음|있습니다|완비|O|o|제공/.test(source)) return true;
  return null;
}

function propertyText(property) {
  return [property.displayName, property.addressOrArea, property.brokerMemo].filter(Boolean).join(" ");
}

function scoreAutoCandidate(customer, property) {
  const score = {
    property,
    failed: 0,
    unknown: 0,
    points: 0,
  };
  const budget = customer?.budget || {};
  const price = property?.price || {};
  const propertyPrice = property.dealType === "월세" ? price.deposit : price.salePrice || price.deposit;
  const maxPrice = property.dealType === "월세" ? budget.maxDeposit || budget.maxPrice : budget.maxPrice || budget.maxDeposit;
  const monthlyRent = price.monthlyRent;
  const haystack = propertyText(property);

  if (customer?.minSizeM2) {
    if (!property.sizeM2) score.unknown += 1;
    else if (property.sizeM2 < customer.minSizeM2) score.failed += 1;
    else score.points += 24;
  }

  if (maxPrice) {
    if (!propertyPrice) score.unknown += 1;
    else if (propertyPrice > maxPrice) score.failed += 1;
    else score.points += 20;
  }

  if (budget.maxMonthlyRent) {
    if (!monthlyRent && property.dealType === "월세") score.unknown += 1;
    else if (monthlyRent && monthlyRent > budget.maxMonthlyRent) score.failed += 1;
    else score.points += 14;
  }

  if (customer?.preferredAreas?.length) {
    const matched = customer.preferredAreas.some((area) => haystack.includes(area));
    score.points += matched ? 16 : 2;
  }

  if (customer?.parkingRequired) {
    const parking = booleanFromAvailability(formatAvailability(property.parking));
    if (parking === true) score.points += 12;
    else if (parking === false) score.failed += 1;
    else score.unknown += 1;
  }

  if (customer?.purpose) {
    if (haystack.includes(customer.purpose)) score.points += 10;
    else score.unknown += 1;
  }

  score.points -= score.failed * 28;
  score.points -= score.unknown * 8;
  if (property.brokerMemo) score.points += 4;
  return score;
}

function selectAutoCandidates(customer, properties) {
  if (!customer) return [];
  return properties
    .map(normalizeBriefingProperty)
    .filter((property) => property.id)
    .map((property) => scoreAutoCandidate(customer, property))
    .sort((a, b) => {
      if (a.failed !== b.failed) return a.failed - b.failed;
      if (a.unknown !== b.unknown) return a.unknown - b.unknown;
      return b.points - a.points;
    })
    .slice(0, 5)
    .map((item) => String(item.property.id));
}

function AIBriefingPage({ setPage }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [propertySearch, setPropertySearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedPropertyIds, setSelectedPropertyIds] = useState([]);
  const [focus, setFocus] = useState(DEFAULT_FOCUS);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [runningAction, setRunningAction] = useState("");
  const [actionFeedback, setActionFeedback] = useState(null);
  const [completedActions, setCompletedActions] = useState({});
  const [propertyVisibleCount, setPropertyVisibleCount] = useState(20);
  const [draftReady, setDraftReady] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [lastSelectedPropertyId, setLastSelectedPropertyId] = useState("");
  const [closestPropertyId, setClosestPropertyId] = useState("");
  const [selectionMode, setSelectionMode] = useState("manual");
  const [restoredNotice, setRestoredNotice] = useState("");
  const resultsRef = useRef(null);
  const selectedSectionRef = useRef(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setCustomers([]);
      setProperties([]);
      setLoading(false);
      setDraftReady(true);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const [customerRows, propertyRows] = await Promise.all([listCustomers(), listProperties()]);
        const safeCustomers = Array.isArray(customerRows) ? customerRows : [];
        const safeProperties = Array.isArray(propertyRows) ? propertyRows : [];
        setCustomers(safeCustomers);
        setProperties(safeProperties);

        const prefill = readBriefingPrefill();
        const prefillCustomerId = String(prefill.customerId || "");
        const validPropertyIds = prefill.propertyIds
          .filter((id) => safeProperties.some((property) => String(property.id) === String(id)))
          .slice(0, 5);
        const hasPrefill = Boolean(prefillCustomerId || validPropertyIds.length);

        if (prefillCustomerId && safeCustomers.some((customer) => String(customer.id) === prefillCustomerId)) {
          setSelectedCustomerId(prefillCustomerId);
          setCustomerSearch("");
        }
        if (validPropertyIds.length) {
          setSelectedPropertyIds(validPropertyIds);
        }
        if (prefillCustomerId || validPropertyIds.length) {
          localStorage.removeItem(AI_BRIEFING_PREFILL_KEY);
          setMessage(validPropertyIds.length ? "고객과 추천 매물을 불러왔습니다. 후보를 추가로 선택한 뒤 브리핑을 생성해 주세요." : "고객을 불러왔습니다. 후보 매물을 선택한 뒤 상담 문구를 만들 수 있습니다.");
          setSelectionMode("manual");
          setResult(null);
          setRestoredNotice("");
        }

        if (!hasPrefill) {
          const draft = readBriefingDraft();
          if (draft) {
            const restoredCustomerId = safeCustomers.some((customer) => String(customer.id) === String(draft.selectedCustomerId))
              ? String(draft.selectedCustomerId)
              : "";
            const restoredPropertyIds = (Array.isArray(draft.selectedPropertyIds) ? draft.selectedPropertyIds : [])
              .filter((id) => safeProperties.some((property) => String(property.id) === String(id)))
              .slice(0, 5);
            const restoredCustomer = safeCustomers.find((customer) => String(customer.id) === restoredCustomerId);
            const restoredProperties = restoredPropertyIds
              .map((id) => safeProperties.find((property) => String(property.id) === String(id)))
              .filter(Boolean);
            const validResultPropertyIds = new Set(restoredPropertyIds.map(String));
            const baseResult = draft.aiBriefingResult
              ? {
                  ...draft.aiBriefingResult,
                  ranking: Array.isArray(draft.aiBriefingResult.ranking)
                    ? draft.aiBriefingResult.ranking.filter((item) => validResultPropertyIds.has(String(item.propertyId)))
                    : [],
                }
              : null;
            const restoredResult = baseResult?.ranking?.length
              ? {
                  ...baseResult,
                  actions: buildRecommendedActions(baseResult, restoredCustomer, restoredProperties),
                }
              : null;

            setSelectedCustomerId(restoredCustomerId);
            setSelectedPropertyIds(restoredPropertyIds);
            setFocus(validFocusValues(draft.selectedCriteria));
            setGeneratedAt(text(draft.generatedAt));
            setLastSelectedPropertyId(text(draft.lastSelectedPropertyId));
            setClosestPropertyId(text(draft.closestPropertyId));
            setSelectionMode(draft.selectionMode === "auto" ? "auto" : "manual");
            setResult(restoredResult);
            if (restoredResult) setRestoredNotice("이전 AI 브리핑 결과를 복원했습니다.");
          }
        }
      } catch (error) {
        setMessage(error.message || "브리핑 데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
        setDraftReady(true);
      }
    }

    load();
  }, [authLoading, isAuthenticated, user?.id]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => String(customer.id) === String(selectedCustomerId)) || null,
    [customers, selectedCustomerId],
  );
  const normalizedCustomer = useMemo(() => (selectedCustomer ? normalizeBriefingCustomer(selectedCustomer) : null), [selectedCustomer]);
  const selectedProperties = useMemo(
    () => selectedPropertyIds.map((id) => properties.find((property) => String(property.id) === String(id))).filter(Boolean),
    [properties, selectedPropertyIds],
  );
  const normalizedSelectedProperties = useMemo(() => selectedProperties.map(normalizeBriefingProperty), [selectedProperties]);
  const filteredCustomers = useMemo(() => {
    const keyword = customerSearch.trim().toLowerCase();
    return customers
      .filter((customer) =>
        !keyword ||
        [customer.name, customer.preferred_area, customer.property_type, customer.wanted_condition, customer.memo]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(keyword),
      )
      .slice(0, 50);
  }, [customers, customerSearch]);
  const filteredProperties = useMemo(() => {
    const keyword = propertySearch.trim().toLowerCase();
    return properties
      .filter((property) => {
        const normalized = normalizeBriefingProperty(property);
        return (
          !keyword ||
          [normalized.displayName, normalized.addressOrArea, normalized.brokerMemo, formatPropertyPrice(normalized)]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(keyword)
        );
      })
      .slice(0, 80);
  }, [properties, propertySearch]);
  const visibleProperties = useMemo(() => filteredProperties.slice(0, propertyVisibleCount), [filteredProperties, propertyVisibleCount]);

  useEffect(() => {
    setPropertyVisibleCount(20);
  }, [propertySearch]);

  useEffect(() => {
    if (!result) return undefined;
    const frame = requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [result]);

  useEffect(() => {
    if (!draftReady) return;
    const draft = buildBriefingDraft({
      selectedCustomerId,
      selectedPropertyIds,
      focus,
      result,
      generatedAt,
      lastSelectedPropertyId,
      closestPropertyId,
      selectionMode,
    });
    if (!draft.selectedCustomerId && !draft.selectedPropertyIds.length && !draft.aiBriefingResult) {
      removeBriefingDraft();
      return;
    }
    writeBriefingDraft(draft);
  }, [closestPropertyId, draftReady, focus, generatedAt, lastSelectedPropertyId, result, selectedCustomerId, selectedPropertyIds, selectionMode]);

  function toggleFocus(id) {
    setRestoredNotice("");
    setResult(null);
    setActionFeedback(null);
    setCompletedActions({});
    setFocus((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function handleCustomerChange(value) {
    setSelectedCustomerId(value);
    setCustomerSearch("");
    setSelectedPropertyIds([]);
    setSelectionMode("manual");
    setLastSelectedPropertyId("");
    setClosestPropertyId("");
    setGeneratedAt("");
    setResult(null);
    setActionFeedback(null);
    setCompletedActions({});
    setRestoredNotice("");
  }

  function toggleProperty(id) {
    setMessage("");
    setRestoredNotice("");
    setResult(null);
    setActionFeedback(null);
    setCompletedActions({});
    setSelectionMode("manual");
    setSelectedPropertyIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((item) => item !== id);
        setLastSelectedPropertyId(next.at(-1) || "");
        setClosestPropertyId("");
        return next;
      }
      if (prev.length >= 5) {
        setMessage("후보 매물은 최대 5개까지 선택할 수 있습니다.");
        return prev;
      }
      setLastSelectedPropertyId(id);
      setClosestPropertyId(id);
      return [...prev, id];
    });
  }

  function handleAutoSelectCandidates() {
    setMessage("");
    setRestoredNotice("");
    if (!normalizedCustomer) {
      setMessage("AI 후보 자동선정을 하려면 고객을 먼저 선택해 주세요.");
      return;
    }
    if (properties.length < 2) {
      setMessage("자동선정할 저장 매물이 2개 이상 필요합니다.");
      return;
    }

    const ids = selectAutoCandidates(normalizedCustomer, properties).slice(0, 5);
    if (ids.length < 2) {
      setMessage("조건에 맞춰 비교할 후보 매물을 충분히 찾지 못했습니다.");
      return;
    }

    setSelectedPropertyIds(ids);
    setSelectionMode("auto");
    setClosestPropertyId(ids[0] || "");
    setLastSelectedPropertyId(ids[0] || "");
    setResult(null);
    setGeneratedAt("");
    setActionFeedback(null);
    setCompletedActions({});
    setMessage(`AI가 고객 조건에 가까운 후보 ${ids.length}개를 자동선정했습니다.`);
    requestAnimationFrame(() => {
      selectedSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleStartNewBriefing() {
    removeBriefingDraft();
    sessionStorage.removeItem(AI_BRIEFING_RETURN_KEY);
    sessionStorage.removeItem(AI_BROCHURE_DRAFT_KEY);
    setSelectedCustomerId("");
    setSelectedPropertyIds([]);
    setFocus(DEFAULT_FOCUS);
    setResult(null);
    setGeneratedAt("");
    setLastSelectedPropertyId("");
    setClosestPropertyId("");
    setSelectionMode("manual");
    setRestoredNotice("");
    setActionFeedback(null);
    setCompletedActions({});
    setMessage("새 AI 브리핑을 시작합니다.");
  }

  async function handleGenerate() {
    setMessage("");
    setResult(null);
    setActionFeedback(null);
    setCompletedActions({});
    if (!selectedCustomer) {
      setMessage("고객을 먼저 선택해 주세요.");
      return;
    }
    if (selectedProperties.length < 2) {
      setMessage("후보 매물은 최소 2개 이상 선택해 주세요.");
      return;
    }
    if (selectedProperties.length > 5) {
      setMessage("후보 매물은 최대 5개까지 선택할 수 있습니다.");
      return;
    }

    setGenerating(true);
    try {
      const apiResult = await generateAiBriefing({
        customer: buildCustomerPayload(selectedCustomer, normalizedCustomer),
        properties: selectedProperties.map((property) => buildPropertyPayload(property, normalizeBriefingProperty(property))),
        criteria: buildCriteriaPayload(focus),
      });
      const primary = getPrimaryRanking(apiResult);
      const nextGeneratedAt = new Date().toISOString();
      setResult({
        ...apiResult,
        actions: buildRecommendedActions(apiResult, selectedCustomer, selectedProperties),
      });
      setGeneratedAt(nextGeneratedAt);
      setClosestPropertyId(String(primary?.propertyId || selectedPropertyIds[0] || ""));
      setMessage("AI 브리핑이 생성되었습니다.");
    } catch (error) {
      setMessage(error.message || "AI 브리핑 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text || "");
      setMessage("복사되었습니다.");
      return true;
    } catch {
      setMessage("복사에 실패했습니다. 문구를 직접 선택해 복사해 주세요.");
      return false;
    }
  }

  async function handleRecommendedAction(action) {
    if (!action || runningAction) return;
    setRunningAction(action.type);
    setMessage("");
    setActionFeedback(null);

    try {
      if (action.type === "save_customer_memo") {
        if (!selectedCustomer) throw new Error("고객을 먼저 선택해 주세요.");
        const existingMemo = text(selectedCustomer.memo || selectedCustomer.notes);
        const nextMemo = appendDatedMemo(existingMemo, action.payload?.memo);
        const saved = await saveCustomer({ ...selectedCustomer, memo: nextMemo });
        setCustomers((prev) => prev.map((customer) => (String(customer.id) === String(saved.id) ? { ...customer, ...saved } : customer)));
        setCompletedActions((prev) => ({ ...prev, [action.type]: true }));
        setActionFeedback({
          type: action.type,
          tone: "success",
          text: "고객 메모에 저장되었습니다. 기존 메모 아래에 날짜와 함께 추가했습니다.",
        });
        setMessage("고객 메모에 저장되었습니다.");
        return;
      }

      if (action.type === "create_schedule") {
        const payload = action.payload || {};
        await saveSchedule({
          title: payload.title || `${selectedCustomer?.name || "고객"} 상담`,
          customer_id: selectedCustomer?.id || "",
          linked_customer_id: selectedCustomer?.id || "",
          customer_name: selectedCustomer?.name || "",
          schedule_date: getTodayValue(),
          schedule_time: "10:00",
          schedule_type: payload.category || "미팅",
          note: payload.memo || "",
        });
        setCompletedActions((prev) => ({ ...prev, [action.type]: true }));
        setActionFeedback({
          type: action.type,
          tone: "success",
          text: "상담 일정이 등록되었습니다. 일정관리의 오늘 10:00 미팅 일정에서 확인할 수 있습니다.",
        });
        setMessage("상담 일정이 등록되었습니다. 일정관리에서 확인할 수 있습니다.");
        return;
      }

      if (action.type === "create_brochure") {
        writeBriefingDraft(buildBriefingDraft({
          selectedCustomerId,
          selectedPropertyIds,
          focus,
          result,
          generatedAt,
          lastSelectedPropertyId,
          closestPropertyId: action.payload?.propertyId || closestPropertyId,
          selectionMode,
        }));
        sessionStorage.setItem(AI_BRIEFING_RETURN_KEY, JSON.stringify({
          from: "ai-briefing",
          propertyId: action.payload?.propertyId || closestPropertyId || "",
          customerId: selectedCustomerId,
          aiDraft: {
            customerMessage: result?.customerMessage || "",
            consultingMemo: result?.consultingMemo || "",
            recommendationSummary: result?.recommendationSummary || "",
          },
        }));
        sessionStorage.setItem(AI_BROCHURE_DRAFT_KEY, JSON.stringify(action.payload || {}));
        window.history.pushState({}, "", "/");
        setPage?.("briefing");
        setMessage("소개서 작성 화면으로 이동합니다.");
        return;
      }

      if (action.type === "find_more_properties") {
        writeBriefingDraft(buildBriefingDraft({
          selectedCustomerId,
          selectedPropertyIds,
          focus,
          result,
          generatedAt,
          lastSelectedPropertyId,
          closestPropertyId,
          selectionMode,
        }));
        if (selectedCustomer?.id) localStorage.setItem(AI_RECOMMEND_CUSTOMER_KEY, String(selectedCustomer.id));
        window.history.pushState({}, "", "/ai-recommend");
        setPage?.("ai-recommend");
        setMessage("AI 매물 추천기로 이동합니다.");
        return;
      }

      if (action.type === "copy_customer_message") {
        await copyText(action.payload?.message || result?.customerMessage || "");
        setCompletedActions((prev) => ({ ...prev, [action.type]: true }));
        setActionFeedback({
          type: action.type,
          tone: "success",
          text: "고객 발송 문구를 클립보드에 복사했습니다.",
        });
      }
    } catch (error) {
      setActionFeedback({
        type: action.type,
        tone: "error",
        text: error.message || "액션 실행 중 오류가 발생했습니다.",
      });
      setMessage(error.message || "AI 추천 액션 실행 중 오류가 발생했습니다.");
    } finally {
      setRunningAction("");
    }
  }

  return (
    <div className="page-stack ai-briefing-page">
      <section className="page-header-card compact-page-header">
        <div>
          <h1>AI 브리핑</h1>
          <p>고객 조건과 후보 매물을 비교해 상담 메모, 고객용 카톡 문안, 소개서 문구를 한 번에 만듭니다.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={handleStartNewBriefing}>새 브리핑 시작</button>
      </section>

      {restoredNotice ? <div className="schedule-inline-alert success-alert">{restoredNotice}</div> : null}

      <section className="ai-briefing-grid">
        <div className="ai-briefing-panel">
          <div className="section-heading-row">
            <div>
              <h2>고객 선택</h2>
              <p>전화번호와 이메일은 AI에 보내지 않습니다.</p>
            </div>
          </div>
          <input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="고객명, 희망 지역, 메모 검색" />
          <select value={selectedCustomerId} onChange={(event) => handleCustomerChange(event.target.value)} disabled={loading}>
            <option value="">{loading ? "고객 불러오는 중" : "고객 선택"}</option>
            {filteredCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name || "이름 없음"} · {customer.property_type || "유형 미입력"}
              </option>
            ))}
          </select>

          {normalizedCustomer ? (
            <div className="ai-briefing-summary-card">
              <strong>{normalizedCustomer.displayName}</strong>
              <dl>
                <div><dt>예산</dt><dd>{formatCustomerBudget(normalizedCustomer)}</dd></div>
                <div><dt>희망 지역</dt><dd>{normalizedCustomer.preferredAreas.join(", ") || "미입력"}</dd></div>
                <div><dt>최소 면적</dt><dd>{normalizedCustomer.minSizeM2 ? `${normalizedCustomer.minSizeM2}㎡ 이상` : "미입력"}</dd></div>
                <div><dt>필수 조건</dt><dd>{normalizedCustomer.requiredConditions.join(", ") || "미입력"}</dd></div>
                <div><dt>중요 메모</dt><dd>{normalizedCustomer.importantMemo || "미입력"}</dd></div>
              </dl>
            </div>
          ) : (
            <div className="ai-briefing-empty">고객을 선택하면 조건 요약이 표시됩니다.</div>
          )}

          <div className="ai-briefing-focus">
            <strong>중요하게 볼 조건</strong>
            <div>
              {AI_BRIEFING_FOCUS_OPTIONS.map((item) => (
                <label key={item.id}>
                  <input type="checkbox" checked={focus.includes(item.id)} onChange={() => toggleFocus(item.id)} />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="ai-briefing-panel">
          <div className="section-heading-row">
            <div>
              <h2>후보 매물 선택</h2>
              <p>최소 2개, 최대 5개까지 비교합니다.</p>
            </div>
            <span className="ai-briefing-count">{selectedPropertyIds.length}/5</span>
          </div>
          <div className="ai-auto-select-box">
            <div>
              <strong>AI로 후보 자동선정</strong>
              <p>고객 조건에 가까운 저장 매물 2~5개를 자동으로 선택합니다.</p>
            </div>
            <button type="button" className="secondary-btn small-btn" onClick={handleAutoSelectCandidates} disabled={loading || !selectedCustomerId}>
              AI로 후보 자동선정
            </button>
          </div>
          <input value={propertySearch} onChange={(event) => setPropertySearch(event.target.value)} placeholder="매물명, 주소, 가격, 메모 검색" />
          <div className="ai-briefing-property-picker">
            {filteredProperties.length ? (
              visibleProperties.map((property) => {
                const normalized = normalizeBriefingProperty(property);
                const active = selectedPropertyIds.includes(String(property.id));
                return (
                  <button key={property.id} type="button" className={active ? "active" : ""} onClick={() => toggleProperty(String(property.id))}>
                    <strong>{normalized.displayName}</strong>
                    <span>{normalized.addressOrArea || "주소 확인 필요"}</span>
                    <small>{formatPropertyPrice(normalized)} · {normalized.sizeM2 ? `${normalized.sizeM2}㎡` : "면적 확인 필요"}</small>
                  </button>
                );
              })
            ) : (
              <div className="ai-briefing-empty">저장된 매물이 없습니다. 소개서 작성에서 매물을 먼저 저장해 주세요.</div>
            )}
            {filteredProperties.length > visibleProperties.length ? (
              <button
                type="button"
                className="secondary-btn ai-briefing-more-btn"
                onClick={() => setPropertyVisibleCount((count) => Math.min(count + 20, filteredProperties.length))}
              >
                더 보기 {visibleProperties.length}/{filteredProperties.length}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section ref={selectedSectionRef} className="ai-briefing-selected-section">
        <div className="section-heading-row">
          <div>
            <h2>선택 매물</h2>
            <p>{selectionMode === "auto" ? "AI 자동선정 후보입니다. 부족한 정보는 확인 필요로 표시됩니다." : "선택 후보 비교입니다. 부족한 정보는 확인 필요로 표시됩니다."}</p>
          </div>
          <span className={`ai-selection-mode mode-${selectionMode}`}>{selectionMode === "auto" ? "AI 자동선정 후보" : "선택 후보 비교"}</span>
          <button type="button" className="primary-btn" onClick={handleGenerate} disabled={generating || loading}>
            {generating ? "AI 브리핑 생성 중..." : "AI 브리핑 생성"}
          </button>
        </div>

        {normalizedSelectedProperties.length ? (
          <div className="ai-briefing-selected-list">
            {normalizedSelectedProperties.map((property) => (
              <article key={property.id}>
                <strong>{property.displayName}</strong>
                <dl>
                  <div><dt>가격</dt><dd>{formatPropertyPrice(property)}</dd></div>
                  <div><dt>면적</dt><dd>{property.sizeM2 ? `${property.sizeM2}㎡` : property.sizeLabel || "확인 필요"}</dd></div>
                  <div><dt>주소</dt><dd>{property.addressOrArea || "확인 필요"}</dd></div>
                  <div><dt>층수</dt><dd>{property.floor || "확인 필요"}</dd></div>
                  <div><dt>주차</dt><dd>{formatAvailability(property.parking)}</dd></div>
                  <div><dt>엘리베이터</dt><dd>{formatAvailability(property.elevator)}</dd></div>
                  <div><dt>교통</dt><dd>{property.transport || "확인 필요"}</dd></div>
                  <div><dt>메모</dt><dd>{property.brokerMemo || "확인 필요"}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <div className="ai-briefing-empty">후보 매물을 선택해 주세요.</div>
        )}
      </section>

      {message ? <div className="schedule-inline-alert">{message}</div> : null}

      {generating ? (
        <section className="ai-briefing-result ai-briefing-loading-result">
          <div>
            <strong>조건을 비교하고 상담 메모를 작성 중입니다.</strong>
            <p>고객 조건, 후보 매물, 필수 조건 미충족 여부를 함께 정리하고 있습니다.</p>
          </div>
          <div className="ai-loading-skeleton">
            <span />
            <span />
            <span />
          </div>
        </section>
      ) : null}

      {result ? (
        <BriefingResult
          result={result}
          onCopy={copyText}
          onAction={handleRecommendedAction}
          runningAction={runningAction}
          actionFeedback={actionFeedback}
          completedActions={completedActions}
          selectionMode={selectionMode}
          generatedAt={generatedAt}
          resultRef={resultsRef}
        />
      ) : null}
    </div>
  );
}

function BriefingResult({ result, onCopy, onAction, runningAction, actionFeedback, completedActions, selectionMode, generatedAt, resultRef }) {
  const ranking = Array.isArray(result.ranking) ? result.ranking : [];
  const checkPoints = Array.isArray(result.checkPoints) ? result.checkPoints : [];
  const actions = Array.isArray(result.actions) ? result.actions : [];
  const summary = summarizeBriefingResult(ranking);
  const hasRecommendedProperties = Boolean(result.hasRecommendedProperties);
  const rankingTitle = hasRecommendedProperties ? "후보 매물 추천 순위" : "조건 충족도 비교 결과";
  const rankingDescription = hasRecommendedProperties
    ? "중개사가 상담 순서를 바로 잡을 수 있도록 정리했습니다."
    : "추천이 아니라 조건에 가까운 비교 참고 후보로 정리했습니다.";
  const modeLabel = selectionMode === "auto" ? "AI 자동선정 후보" : "선택 후보 비교";

  return (
    <section ref={resultRef} className="ai-briefing-result ai-briefing-generated-result">
      <div className="ai-briefing-result-titlebar">
        <div>
          <h2>AI 분석 결과</h2>
          <p>{modeLabel} 기준으로 생성되었습니다.{generatedAt ? ` · ${new Date(generatedAt).toLocaleString("ko-KR")}` : ""}</p>
        </div>
        <small>{modeLabel}</small>
      </div>

      <div className="ai-score-disclaimer">
        없는 정보는 생성하지 않고 확인 필요로 정리합니다. 법률·세무·권리관계 판단은 상담 전 별도 확인이 필요합니다.
      </div>

      {selectionMode === "auto" ? (
        <div className="ai-auto-selection-notice">
          AI가 고객 조건을 기준으로 저장 매물 중 가까운 후보를 자동선정했습니다.
        </div>
      ) : null}

      <JudgmentSummaryCard summary={summary} hasRecommendedProperties={hasRecommendedProperties} />

      <div className="ai-briefing-generated-grid">
        <ResultTextCard title="고객 조건 요약" text={result.customerSummary} />
        <ResultTextCard title="추천 요약" text={result.recommendationSummary} />
      </div>

      <div className="ai-briefing-result-section">
        <div className="section-heading-row">
          <div>
            <h2>{rankingTitle}</h2>
            <p>{rankingDescription}</p>
          </div>
        </div>
        <div className="ai-briefing-ranking-cards">
          {ranking.map((item, index) => {
            const failed = Boolean(item.failedRequiredConditions?.length);
            const status = getRankingStatus(item);
            return (
              <article
                key={`${item.propertyId}-${item.rank}`}
                className={`ai-generated-ranking-card ${failed ? "has-required-fail" : ""}`}
              >
                <div className="ai-generated-ranking-head">
                  <span className="ai-rank-label">{getRankingLabel(item, index, hasRecommendedProperties)}</span>
                  <strong>{item.title}</strong>
                  <div className="ai-card-badges">
                    <em className={`ai-card-status status-${status.className}`}>{status.label}</em>
                    <em className={`ai-fit-badge fit-${fitClassName(item.fitScore)}`}>{item.fitScore}</em>
                  </div>
                </div>
                <div className="ai-condition-summary">{item.conditionSummary || "필수 조건 확인 필요"}</div>
                <ConditionCheckRow checks={item.conditionChecks} />
                <dl>
                  <div>
                    <dt>{item.isRecommended ? "추천 이유" : "비교 참고 이유"}</dt>
                    <dd>{item.reason}</dd>
                  </div>
                  <div>
                    <dt>아쉬운 점</dt>
                    <dd>{item.weakPoint}</dd>
                  </div>
                  <div>
                    <dt>상담 포인트</dt>
                    <dd>{item.talkingPoint}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </div>

      <div className="ai-briefing-generated-grid">
        <CopyPanel title="상담 메모" text={result.consultingMemo} onCopy={onCopy} />
        <CopyPanel title="고객 발송 문구 초안" text={result.customerMessage} onCopy={onCopy} />
      </div>

      <div className="ai-briefing-result-section">
        <div className="section-heading-row">
          <div>
            <h2>추가 확인사항</h2>
            <p>상담 전후로 확인하면 좋은 항목입니다.</p>
          </div>
        </div>
        {checkPoints.length ? (
          <ul className="ai-generated-check-list">
            {checkPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <div className="ai-briefing-empty">추가 확인사항이 없습니다.</div>
        )}
      </div>

      <RecommendedActions actions={actions} onAction={onAction} runningAction={runningAction} actionFeedback={actionFeedback} completedActions={completedActions} />
    </section>
  );
}

function RecommendedActions({ actions, onAction, runningAction, actionFeedback, completedActions }) {
  if (!actions.length) return null;
  const primaryActions = actions.filter((action) => action.primary).slice(0, 3);
  const secondaryActions = actions.filter((action) => !primaryActions.includes(action));

  return (
    <section className="ai-briefing-result-section ai-agent-actions">
      <div className="section-heading-row">
        <div>
          <h2>다음 작업 추천</h2>
          <p>AI 브리핑 결과를 바탕으로 이어서 처리할 수 있는 업무입니다.</p>
        </div>
        <span className="ai-agent-approval-note">사용자 확인 후 실행</span>
      </div>

      <div className="ai-agent-action-grid">
        {primaryActions.map((action) => (
          <ActionButton key={action.type} action={action} onAction={onAction} runningAction={runningAction} completed={Boolean(completedActions?.[action.type])} primary />
        ))}
      </div>

      {secondaryActions.length ? (
        <div className="ai-agent-secondary-actions">
          {secondaryActions.map((action) => (
            <ActionButton key={action.type} action={action} onAction={onAction} runningAction={runningAction} completed={Boolean(completedActions?.[action.type])} />
          ))}
        </div>
      ) : null}

      {actionFeedback ? (
        <div className={`ai-agent-action-feedback tone-${actionFeedback.tone || "success"}`}>
          {actionFeedback.text}
        </div>
      ) : null}
    </section>
  );
}

function actionButtonText(action, running, completed) {
  if (running) return "처리 중...";
  if (completed && action.type !== "copy_customer_message") return "완료";
  if (action.type === "save_customer_memo") return "저장";
  if (action.type === "create_schedule") return "등록";
  if (action.type === "copy_customer_message") return completed ? "복사됨" : "복사";
  if (action.type === "create_brochure" || action.type === "find_more_properties") return "이동";
  return "실행";
}

function ActionButton({ action, onAction, runningAction, completed, primary = false }) {
  const running = runningAction === action.type;
  const disabled = Boolean(runningAction) || (completed && action.type !== "copy_customer_message");
  return (
    <article className={`${primary ? "ai-agent-action primary-action" : "ai-agent-action secondary-action"} ${completed ? "is-completed" : ""}`}>
      <div>
        <strong>
          {action.label}
          {completed ? <em>완료</em> : null}
        </strong>
        <span>{action.description}</span>
      </div>
      <button type="button" className="ai-agent-run-btn" onClick={() => onAction(action)} disabled={disabled}>
        {actionButtonText(action, running, completed)}
      </button>
    </article>
  );
}

function JudgmentSummaryCard({ summary, hasRecommendedProperties }) {
  const headline = hasRecommendedProperties
    ? `추천 가능한 매물 ${summary.recommendedCount}건이 있습니다.`
    : "조건에 완전히 맞는 매물이 없습니다. 조건 조정 또는 추가 매물 확인이 필요합니다.";

  return (
    <div className={`ai-judgment-card ${hasRecommendedProperties ? "is-positive" : "is-warning"}`}>
      <div className="ai-judgment-head">
        <span>AI 판단 요약</span>
        <strong>{headline}</strong>
      </div>
      <div className="ai-judgment-metrics">
        <div>
          <span>조건 완전 일치</span>
          <strong>{summary.recommendedCount ? `${summary.recommendedCount}개` : "없음"}</strong>
        </div>
        <div>
          <span>비교 후보</span>
          <strong>{summary.comparisonCount}개</strong>
        </div>
        <div>
          <span>필수 조건 미충족</span>
          <strong>{summary.failedCount}개</strong>
        </div>
        <div>
          <span>추가 확인 필요</span>
          <strong>{summary.unknownLabels || "없음"}</strong>
        </div>
      </div>
    </div>
  );
}

function summarizeBriefingResult(ranking) {
  const unknownLabels = new Set();
  ranking.forEach((item) => {
    Object.entries(item.conditionChecks || {}).forEach(([key, check]) => {
      if (check?.passed === null) unknownLabels.add(getConditionLabel(key));
    });
  });

  return {
    recommendedCount: ranking.filter((item) => item.isRecommended).length,
    comparisonCount: ranking.length,
    failedCount: ranking.filter((item) => item.failedRequiredConditions?.length).length,
    unknownLabels: [...unknownLabels].join(", "),
  };
}

function getRankingStatus(item) {
  if (item.isRecommended) return { label: "추천 가능", className: "recommended" };
  if (item.failedRequiredConditions?.length) return { label: "필수 조건 미충족", className: "fail" };
  return { label: "비교 참고", className: "reference" };
}

function getRankingLabel(item, index, hasRecommendedProperties) {
  if (item.isRecommended) return `${item.rank || index + 1}위`;
  if (!hasRecommendedProperties && index === 0) return "가장 가까운 후보";
  if (!hasRecommendedProperties) return `비교 후보 ${index + 1}`;
  return `비교 후보 ${item.rank || index + 1}`;
}

function ConditionCheckRow({ checks = {} }) {
  const items = [
    ["area", "면적"],
    ["budget", "가격"],
    ["monthlyRent", "월세"],
    ["parking", "주차"],
    ["useType", "용도"],
  ];

  return (
    <div className="ai-condition-chip-row">
      {items.map(([key, label]) => {
        const check = checks?.[key] || {};
        return (
          <span key={key} className={`condition-${conditionStatusClass(check.passed)}`}>
            {label}: {conditionStatusLabel(check.passed)}
          </span>
        );
      })}
    </div>
  );
}

function getConditionLabel(key) {
  return {
    area: "면적",
    budget: "가격",
    monthlyRent: "월세",
    parking: "주차",
    useType: "용도",
  }[key] || key;
}

function conditionStatusLabel(value) {
  if (value === true) return "충족";
  if (value === false) return "미충족";
  return "확인 필요";
}

function conditionStatusClass(value) {
  if (value === true) return "pass";
  if (value === false) return "fail";
  return "unknown";
}

function ResultTextCard({ title, text }) {
  return (
    <article className="ai-result-text-card">
      <strong>{title}</strong>
      <p>{text || "확인 필요"}</p>
    </article>
  );
}

function fitClassName(value = "") {
  return {
    높음: "high",
    보통: "medium",
    낮음: "low",
    "확인 필요": "unknown",
  }[value] || "medium";
}

function CopyPanel({ title, text, onCopy }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await onCopy(text, title);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article className="ai-copy-panel">
      <div className="ai-copy-panel-head">
        <strong>{title}</strong>
        <div className="ai-copy-actions">
          {copied ? <span>복사되었습니다.</span> : null}
          <button type="button" className="secondary-btn small-btn" onClick={handleCopy}>복사</button>
        </div>
      </div>
      <p>{text}</p>
    </article>
  );
}

export default AIBriefingPage;
