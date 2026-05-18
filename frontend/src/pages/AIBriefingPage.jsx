import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { generateAiBriefing } from "../services/aiBriefingService";
import { listCustomers, listProperties } from "../services/supabaseRepository";
import {
  AI_BRIEFING_FOCUS_OPTIONS,
  formatAvailability,
  formatCustomerBudget,
  formatPropertyPrice,
  normalizeBriefingCustomer,
  normalizeBriefingProperty,
} from "../utils/aiBriefing";

const AI_BRIEFING_PREFILL_KEY = "agentnote_ai_briefing_prefill";

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

function AIBriefingPage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [propertySearch, setPropertySearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedPropertyIds, setSelectedPropertyIds] = useState([]);
  const [focus, setFocus] = useState(["price", "location", "size"]);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [propertyVisibleCount, setPropertyVisibleCount] = useState(20);
  const resultsRef = useRef(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setCustomers([]);
      setProperties([]);
      setLoading(false);
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
        }
      } catch (error) {
        setMessage(error.message || "브리핑 데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
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

  function toggleFocus(id) {
    setFocus((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleProperty(id) {
    setMessage("");
    setSelectedPropertyIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= 5) {
        setMessage("후보 매물은 최대 5개까지 선택할 수 있습니다.");
        return prev;
      }
      return [...prev, id];
    });
  }

  async function handleGenerate() {
    setMessage("");
    setResult(null);
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
      setResult(apiResult);
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

  return (
    <div className="page-stack ai-briefing-page">
      <section className="page-header-card compact-page-header">
        <div>
          <h1>AI 브리핑</h1>
          <p>고객 조건과 후보 매물을 비교해 상담 메모, 고객용 카톡 문안, 소개서 문구를 한 번에 만듭니다.</p>
        </div>
      </section>

      <section className="ai-briefing-grid">
        <div className="ai-briefing-panel">
          <div className="section-heading-row">
            <div>
              <h2>고객 선택</h2>
              <p>전화번호와 이메일은 AI에 보내지 않습니다.</p>
            </div>
          </div>
          <input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="고객명, 희망 지역, 메모 검색" />
          <select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} disabled={loading}>
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

      <section className="ai-briefing-selected-section">
        <div className="section-heading-row">
          <div>
            <h2>선택 매물</h2>
            <p>부족한 정보는 확인 필요로 표시됩니다.</p>
          </div>
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
          resultRef={resultsRef}
        />
      ) : null}
    </div>
  );
}

function BriefingResult({ result, onCopy, resultRef }) {
  const ranking = Array.isArray(result.ranking) ? result.ranking : [];
  const checkPoints = Array.isArray(result.checkPoints) ? result.checkPoints : [];
  const summary = summarizeBriefingResult(ranking);
  const hasRecommendedProperties = Boolean(result.hasRecommendedProperties);
  const rankingTitle = hasRecommendedProperties ? "후보 매물 추천 순위" : "조건 충족도 비교 결과";
  const rankingDescription = hasRecommendedProperties
    ? "중개사가 상담 순서를 바로 잡을 수 있도록 정리했습니다."
    : "추천이 아니라 조건에 가까운 비교 참고 후보로 정리했습니다.";

  return (
    <section ref={resultRef} className="ai-briefing-result ai-briefing-generated-result">
      <div className="ai-briefing-result-titlebar">
        <div>
          <span className="ai-briefing-mode">OpenAI 브리핑</span>
          <h2>AI 분석 결과</h2>
          <p>입력된 고객 조건과 후보 매물 정보 기준으로 생성되었습니다.</p>
        </div>
        <small>조건 비교 및 상담 문구</small>
      </div>

      <div className="ai-score-disclaimer">
        없는 정보는 생성하지 않고 확인 필요로 정리합니다. 법률·세무·권리관계 판단은 상담 전 별도 확인이 필요합니다.
      </div>

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
    </section>
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
