import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { generateAiBriefing, saveCustomerPropertyFeedback } from "../services/aiBriefingService";
import { listCustomers, listProperties } from "../services/supabaseRepository";
import {
  AI_BRIEFING_FOCUS_OPTIONS,
  createRuleBasedBriefing,
  formatAvailability,
  formatCustomerBudget,
  formatPropertyPrice,
  normalizeBriefingCustomer,
  normalizeBriefingProperty,
} from "../utils/aiBriefing";

const MODE_LABELS = {
  llm: "AI 생성",
  rule_based: "룰베이스",
  fallback: "오류로 fallback",
  budget_exceeded: "비용 한도 초과",
  api_key_missing: "API 키 없음",
};

const FEEDBACK_OPTIONS = [
  ["interested", "관심 있음"],
  ["visit_requested", "방문 요청"],
  ["price_burden", "가격 부담"],
  ["location_bad", "위치 아쉬움"],
  ["parking_issue", "주차 이슈"],
  ["size_small", "면적 작음"],
  ["hold", "보류"],
  ["rejected", "거절"],
  ["other", "기타"],
];

const BRIEFING_TABS = [
  ["summary", "추천 요약"],
  ["broker", "중개사용 메모"],
  ["customer", "고객용 문구"],
  ["brochure", "소개서 문구"],
];

const CUSTOMER_MESSAGE_TABS = [
  ["short", "짧게 보내기"],
  ["normal", "기본 안내"],
  ["softPersuasive", "부드러운 제안"],
];

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
  const [feedback, setFeedback] = useState({ feedbackType: "interested", propertyId: "", memo: "" });

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
        setCustomers(Array.isArray(customerRows) ? customerRows : []);
        setProperties(Array.isArray(propertyRows) ? propertyRows : []);
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
    if (selectedPropertyIds.length < 2) {
      setMessage("후보 매물은 최소 2개 이상 선택해 주세요.");
      return;
    }
    if (selectedPropertyIds.length > 5) {
      setMessage("후보 매물은 최대 5개까지 선택할 수 있습니다.");
      return;
    }

    setGenerating(true);
    try {
      const apiResult = await generateAiBriefing({ customerId: selectedCustomerId, propertyIds: selectedPropertyIds, focus });
      setResult(apiResult);
      setFeedback((prev) => ({ ...prev, propertyId: apiResult.briefing?.rankings?.[0]?.propertyId || "" }));
      if (apiResult.fallbackMessage) setMessage(apiResult.fallbackMessage);
    } catch (error) {
      const localResult = createRuleBasedBriefing({
        customer: selectedCustomer,
        properties: selectedProperties,
        focus,
        mode: "fallback",
      });
      setResult(localResult);
      setFeedback((prev) => ({ ...prev, propertyId: localResult.briefing?.rankings?.[0]?.propertyId || "" }));
      setMessage(error.message || "AI 호출을 사용하지 않고 룰베이스 브리핑으로 생성했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text || "");
      setMessage(`${label}을 복사했습니다.`);
    } catch {
      setMessage("복사에 실패했습니다. 문구를 직접 선택해 복사해 주세요.");
    }
  }

  async function handleFeedbackSave() {
    if (!selectedCustomerId) return;
    try {
      await saveCustomerPropertyFeedback({
        customerId: selectedCustomerId,
        propertyId: feedback.propertyId || null,
        aiBriefingId: result?.briefingId || null,
        feedbackType: feedback.feedbackType,
        memo: feedback.memo,
      });
      setMessage("고객 반응을 저장했습니다.");
      setFeedback((prev) => ({ ...prev, memo: "" }));
    } catch (error) {
      setMessage(error.message || "고객 반응 저장에 실패했습니다.");
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
              filteredProperties.map((property) => {
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
          </div>
        </div>
      </section>

      <section className="ai-briefing-selected-section">
        <div className="section-heading-row">
          <div>
            <h2>선택 매물</h2>
            <p>부족한 정보는 확인 필요로 표시됩니다.</p>
          </div>
          <button type="button" className="primary-btn" onClick={handleGenerate} disabled={generating || selectedPropertyIds.length < 2 || !selectedCustomerId}>
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

      {result?.briefing ? (
        <BriefingResult
          result={result}
          properties={normalizedSelectedProperties}
          feedback={feedback}
          setFeedback={setFeedback}
          onCopy={copyText}
          onFeedbackSave={handleFeedbackSave}
        />
      ) : null}
    </div>
  );
}

function BriefingResult({ result, properties, feedback, setFeedback, onCopy, onFeedbackSave }) {
  const briefing = result.briefing;
  const [activeTab, setActiveTab] = useState("summary");
  const [messageType, setMessageType] = useState("normal");
  const [checksOpen, setChecksOpen] = useState(false);
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const compactChecks = compactCheckLabels(briefing.missingChecks);
  const visibleChecks = compactChecks.slice(0, 3);
  const hiddenChecks = compactChecks.slice(3);
  const activeMessageTitle = CUSTOMER_MESSAGE_TABS.find(([key]) => key === messageType)?.[1] || "고객용 문구";
  const activeMessage = briefing.customerMessages?.[messageType] || "";

  return (
    <section className="ai-briefing-result">
      <div className="ai-briefing-summary-shell">
        <div className="ai-briefing-result-titlebar">
          <span className={`ai-briefing-mode mode-${result.mode}`}>{MODE_LABELS[result.mode] || result.mode}</span>
          {result.estimatedCostUsd !== undefined ? (
            <small className="ai-cost-note">예상 ${Number(result.estimatedCostUsd || 0).toFixed(5)}{result.actualCostUsd ? ` · 실제 ${Number(result.actualCostUsd).toFixed(5)}` : ""}</small>
          ) : null}
        </div>
        <div className="ai-briefing-conclusion">
          <span>한 줄 결론</span>
          <strong>{briefing.summary}</strong>
          <p>{briefing.recommendationComment}</p>
        </div>
        <div className="ai-check-summary">
          <strong>먼저 확인할 것</strong>
          {visibleChecks.length ? visibleChecks.map((item) => <span key={item}>{item}</span>) : <span>추가 확인 사항 없음</span>}
          {hiddenChecks.length ? (
            <button type="button" className="text-link-btn" onClick={() => setChecksOpen((value) => !value)}>
              {checksOpen ? "접기" : `전체 ${compactChecks.length}개 보기`}
            </button>
          ) : null}
        </div>
        {checksOpen ? (
          <div className="ai-check-expanded">
            {hiddenChecks.map((item) => <span key={item}>{item}</span>)}
          </div>
        ) : null}
      </div>

      <div className="ai-score-disclaimer">
        조건 적합도는 입력된 고객 조건과 매물 정보를 기준으로 계산한 참고 점수입니다. 정보가 부족한 항목은 현장 확인이 필요합니다.
      </div>

      <div className="ai-briefing-tabs" role="tablist" aria-label="AI 브리핑 결과">
        {BRIEFING_TABS.map(([key, label]) => (
          <button key={key} type="button" className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === "summary" ? (
        <div className="ai-briefing-tab-panel">
          <div className="ai-briefing-ranking-list compact">
            {briefing.rankings.slice(0, 3).map((ranking) => (
              <RankingSummaryCard key={ranking.propertyId} ranking={ranking} property={propertyById.get(String(ranking.propertyId))} />
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === "broker" ? (
        <div className="ai-briefing-tab-panel two-column">
          <CopyPanel title="중개사용 상담 메모" text={briefing.brokerNote} onCopy={onCopy} />
          <article className="ai-broker-workflow">
            <strong>상담 시 먼저 확인할 포인트</strong>
            <ol>
              {(compactChecks.length ? compactChecks.slice(0, 5) : ["예산/가격 조건 확인", "희망 지역 일치 여부 확인", "주차·입주 가능일 확인"]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            <strong>상담 순서 제안</strong>
            <ol>
              <li>예산과 거래 조건부터 맞춰봅니다.</li>
              <li>희망 지역, 면적, 용도를 고객 표현으로 다시 확인합니다.</li>
              <li>주차, 엘리베이터, 입주 가능일처럼 현장 확인 항목을 정리합니다.</li>
            </ol>
          </article>
        </div>
      ) : null}

      {activeTab === "customer" ? (
        <div className="ai-briefing-tab-panel">
          <div className="ai-message-segment" role="tablist" aria-label="고객용 문구 유형">
            {CUSTOMER_MESSAGE_TABS.map(([key, label]) => (
              <button key={key} type="button" className={messageType === key ? "active" : ""} onClick={() => setMessageType(key)}>
                {label}
              </button>
            ))}
          </div>
          <CopyPanel title={activeMessageTitle} text={activeMessage} onCopy={onCopy} />
        </div>
      ) : null}

      {activeTab === "brochure" ? (
        <div className="ai-briefing-tab-panel">
          <CopyPanel
            title="소개서 문구"
            text={`${briefing.brochureCopy.title}\n\n${briefing.brochureCopy.summary}\n- ${briefing.brochureCopy.bullets.slice(0, 4).join("\n- ")}`}
            onCopy={onCopy}
          />
        </div>
      ) : null}

      <div className="ai-briefing-feedback">
        <strong>고객 반응 기록</strong>
        <select value={feedback.propertyId} onChange={(event) => setFeedback((prev) => ({ ...prev, propertyId: event.target.value }))}>
          <option value="">브리핑 전체</option>
          {briefing.rankings.map((ranking) => (
            <option key={ranking.propertyId} value={ranking.propertyId}>{ranking.displayName}</option>
          ))}
        </select>
        <select value={feedback.feedbackType} onChange={(event) => setFeedback((prev) => ({ ...prev, feedbackType: event.target.value }))}>
          {FEEDBACK_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input value={feedback.memo} onChange={(event) => setFeedback((prev) => ({ ...prev, memo: event.target.value }))} placeholder="반응 메모" />
        <button type="button" className="secondary-btn" onClick={onFeedbackSave}>반응 저장</button>
      </div>
    </section>
  );
}

function RankingSummaryCard({ ranking, property }) {
  return (
    <article>
      <div className="ai-ranking-head">
        <span>{ranking.rank}위</span>
        <strong>{ranking.displayName}</strong>
        <em>{ranking.score}점</em>
      </div>
      <div className="ai-ranking-meta">
        <b>{ranking.gradeLabel || gradeLabel(ranking.grade)}</b>
        {ranking.infoCompleteness !== undefined ? <small>정보 완성도 {ranking.infoCompleteness}점</small> : null}
      </div>
      <p>{ranking.shortReason}</p>
      <div className="ai-ranking-two-col">
        <InfoList title="좋은 점" items={briefItems(ranking.strengths)} empty="조건과 맞는 부분을 확인 중입니다." />
        <InfoList title="주의점" items={briefItems(ranking.concerns)} empty="큰 주의점은 없지만 현장 확인은 필요합니다." />
      </div>
      <div className="ai-check-summary slim">
        {(ranking.missingChecks || []).slice(0, 3).map((item) => <span key={item}>{shortCheckLabel(item)}</span>)}
      </div>
      {property ? <small>{property.addressOrArea || "위치 확인 필요"} · {formatPropertyPrice(property)}</small> : null}
    </article>
  );
}

function InfoList({ title, items = [], empty = "확인 필요" }) {
  return (
    <div>
      <strong>{title}</strong>
      <ul>
        {(items.length ? items : [empty]).map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function gradeLabel(grade) {
  return {
    excellent: "우선 추천",
    good: "검토 추천",
    fair: "조건 일부 불일치",
    risky: "추천 주의",
  }[grade] || "검토";
}

function CopyPanel({ title, text, onCopy }) {
  return (
    <article className="ai-copy-panel">
      <div>
        <strong>{title}</strong>
        <button type="button" className="secondary-btn small-btn" onClick={() => onCopy(text, title)}>복사</button>
      </div>
      <p>{text}</p>
    </article>
  );
}

function briefItems(items = []) {
  return items.slice(0, 3);
}

function compactCheckLabels(items = []) {
  return [...new Set(items.map(shortCheckLabel).filter(Boolean))].slice(0, 8);
}

function shortCheckLabel(item = "") {
  return String(item)
    .replace(/매물\s*/g, "")
    .replace(/고객\s*/g, "")
    .replace(/정보\s*/g, "")
    .replace(/여부\s*/g, "")
    .replace(/항목은?\s*/g, "")
    .replace(/확인\s*필요/g, "확인 필요")
    .replace(/가격.*부족/g, "가격 확인 필요")
    .replace(/주소\/지역.*부족/g, "위치 확인 필요")
    .replace(/면적.*부족/g, "면적 확인 필요")
    .replace(/업종\/용도.*확인 필요/g, "용도 확인 필요")
    .replace(/입주 가능일.*확인 필요/g, "입주일 확인 필요")
    .trim();
}

export default AIBriefingPage;
