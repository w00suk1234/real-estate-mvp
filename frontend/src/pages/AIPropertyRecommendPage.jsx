import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { listCustomers, listProperties, saveCustomer } from "../services/supabaseRepository";
import { generateRecommendationSummary } from "../services/aiRecommendationService";
import {
  hasEnoughCustomerCondition,
  normalizeCustomerCondition,
  normalizePropertyData,
  recommendPropertiesForCustomer,
} from "../utils/recommendProperties";

const SELECTED_CUSTOMER_KEY = "agentnote_recommend_customer_id";
const SCORE_FILTERS = [
  { label: "90점 이상", value: 90, limit: 5 },
  { label: "70점 이상", value: 70, limit: 5 },
  { label: "55점 이상", value: 55, limit: 5 },
  { label: "전체보기", value: 30, limit: 30 },
];

function createConditionDraft(customer = {}) {
  return {
    preferred_area: customer.preferred_area || "",
    property_type: customer.property_type || "사무실",
    wanted_condition: customer.wanted_condition || customer.requirement || "",
    memo: customer.memo || customer.notes || "",
  };
}

function AIPropertyRecommendPage({ setPage }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [results, setResults] = useState([]);
  const [minScore, setMinScore] = useState(55);
  const [conditionDraft, setConditionDraft] = useState(() => createConditionDraft());
  const [conditionEditing, setConditionEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [recommending, setRecommending] = useState(false);
  const [savingCondition, setSavingCondition] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setCustomers([]);
      setProperties([]);
      setSelectedCustomerId("");
      setResults([]);
      setLoading(false);
      return;
    }

    async function loadData() {
      try {
        setLoading(true);
        const [customerRows, propertyRows] = await Promise.all([listCustomers(), listProperties()]);
        setCustomers(Array.isArray(customerRows) ? customerRows : []);
        setProperties(Array.isArray(propertyRows) ? propertyRows : []);

        const params = new URLSearchParams(window.location.search);
        const queryCustomerId = params.get("customerId");
        const storedCustomerId = localStorage.getItem(SELECTED_CUSTOMER_KEY);
        setSelectedCustomerId(queryCustomerId || storedCustomerId || "");
      } catch (error) {
        setMessage(error.message || "고객 또는 매물 목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [authLoading, isAuthenticated, user?.id]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => String(customer.id) === String(selectedCustomerId)) || null,
    [customers, selectedCustomerId],
  );

  const customerCondition = useMemo(
    () => (selectedCustomer ? normalizeCustomerCondition(selectedCustomer) : null),
    [selectedCustomer],
  );

  const activeScoreFilter = SCORE_FILTERS.find((item) => item.value === minScore) || SCORE_FILTERS[2];
  const visibleResults = results;
  const filteredCustomers = useMemo(() => {
    const keyword = customerSearch.trim().toLowerCase();
    const filtered = keyword
      ? customers.filter((customer) =>
          [customer.name, customer.phone, customer.preferred_area, customer.wanted_condition, customer.property_type]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(keyword),
        )
      : customers;
    const selected = selectedCustomer && !filtered.some((customer) => String(customer.id) === String(selectedCustomer.id)) ? [selectedCustomer] : [];
    return [...selected, ...filtered].slice(0, keyword ? 30 : 100);
  }, [customerSearch, customers, selectedCustomer]);

  useEffect(() => {
    setConditionDraft(createConditionDraft(selectedCustomer || {}));
    setConditionEditing(false);
  }, [selectedCustomer]);

  const handleCustomerChange = (value) => {
    setSelectedCustomerId(value);
    setResults([]);
    setMessage("");
    setConditionEditing(false);
    if (value) localStorage.setItem(SELECTED_CUSTOMER_KEY, value);
    else localStorage.removeItem(SELECTED_CUSTOMER_KEY);
  };

  const handleRecommend = async () => {
    setCopyMessage("");
    if (!selectedCustomer) {
      setMessage("추천할 고객을 먼저 선택해 주세요.");
      return;
    }
    if (!properties.length) {
      setMessage("등록된 매물이 없어 추천할 수 없습니다.");
      return;
    }

    setRecommending(true);
    try {
      await Promise.resolve();
      const recommended = recommendPropertiesForCustomer(selectedCustomer, properties, {
        limit: activeScoreFilter.limit,
        minScore: activeScoreFilter.value,
      });
      const summarized = generateRecommendationSummary(selectedCustomer, recommended);
      setResults(summarized);

      if (!hasEnoughCustomerCondition(selectedCustomer)) {
        setMessage("고객 희망 조건이 부족합니다. 예산, 희망지역, 거래유형 등을 입력하면 더 정확하게 추천할 수 있습니다.");
        return;
      }

      if (!summarized.length) {
        setMessage(`${activeScoreFilter.label} 조건에 맞는 매물이 없습니다. 조건 적합도 기준을 낮춰 보세요.`);
        return;
      }

      setMessage("");
    } catch (error) {
      setMessage(error.message || "추천 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setRecommending(false);
    }
  };

  const handleConditionDraftChange = (key, value) => {
    setConditionDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveCondition = async () => {
    if (!selectedCustomer || savingCondition) return;
    setSavingCondition(true);
    setCopyMessage("");
    try {
      const saved = await saveCustomer({
        ...selectedCustomer,
        ...conditionDraft,
      });
      setCustomers((prev) =>
        prev.map((customer) => (String(customer.id) === String(saved.id) ? { ...customer, ...conditionDraft, ...saved } : customer)),
      );
      setResults([]);
      setConditionEditing(false);
      setMessage("고객 추천 조건을 저장했습니다. 추천 매물 찾기를 다시 눌러 주세요.");
    } catch (error) {
      setMessage(error.message || "고객 조건 저장에 실패했습니다.");
    } finally {
      setSavingCondition(false);
    }
  };

  const handleCancelConditionEdit = () => {
    setConditionDraft(createConditionDraft(selectedCustomer || {}));
    setConditionEditing(false);
    setCopyMessage("");
  };

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage("문구가 복사되었습니다.");
    } catch {
      setCopyMessage("복사에 실패했습니다. 직접 선택해 복사해 주세요.");
    }
  };

  return (
    <div className="page-stack ai-recommend-page">
      <section className="page-header-card compact-page-header ai-recommend-header">
        <div>
          <h1>AI 매물 추천기</h1>
          <p>고객 희망 조건을 기준으로 등록된 매물 중 적합한 매물을 추천합니다.</p>
        </div>
      </section>

      <section className="recommend-flow-strip" aria-label="추천 흐름">
        <span className={selectedCustomer ? "done" : "active"}>1 고객 선택</span>
        <span className={selectedCustomer ? "active" : ""}>2 조건 확인</span>
        <span>3 추천 실행</span>
        <span>4 결과 확인</span>
      </section>

      <section className="ai-recommend-control-panel">
        <div className="recommend-customer-picker">
          <div className="recommend-panel-heading">
            <span className="page-eyebrow">STEP 1</span>
            <h2>고객 선택</h2>
            <p>추천할 고객을 고르면 희망 조건을 기준으로 매물을 비교합니다.</p>
          </div>
          <label className="field compact-recommend-select">
            <span>고객</span>
            <input
              className="recommend-customer-search"
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
              placeholder="고객명, 연락처, 지역으로 검색"
              disabled={loading}
            />
            <select value={selectedCustomerId} onChange={(event) => handleCustomerChange(event.target.value)} disabled={loading}>
              <option value="">{loading ? "고객 목록을 불러오는 중입니다" : customerSearch ? "검색 결과에서 고객을 선택해 주세요" : "추천할 고객을 선택해 주세요"}</option>
              {filteredCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name || "이름 없음"} {customer.phone ? `· ${customer.phone}` : ""}
                </option>
              ))}
            </select>
          </label>

          {selectedCustomer ? (
            <CustomerConditionEditor
              customer={customerCondition}
              draft={conditionDraft}
              onChange={handleConditionDraftChange}
              editing={conditionEditing}
              onEdit={() => setConditionEditing(true)}
              onSave={handleSaveCondition}
              onCancel={handleCancelConditionEdit}
              saving={savingCondition}
            />
          ) : (
            <div className="recommend-empty-note"><strong>추천할 고객을 먼저 선택해 주세요.</strong><span>고객관리의 희망 지역, 예산, 매물 종류가 추천 조건으로 사용됩니다.</span></div>
          )}
        </div>

        <div className="recommend-action-card">
          <div className="recommend-panel-heading">
            <span className="page-eyebrow">추천 조건 요약</span>
            <h2>{selectedCustomer ? `${customerCondition.name} 고객 조건` : "고객 조건 대기"}</h2>
            <p>
              외부 AI API 없이 거래유형, 예산, 지역, 면적, 주차, 입주 가능일을 점수화합니다.
            </p>
          </div>
          {selectedCustomer ? <ConditionSummary customer={customerCondition} /> : <div className="condition-waiting-box">고객을 선택하면 거래유형, 예산, 지역, 면적 조건이 여기에 정리됩니다.</div>}
          <div className="recommend-score-control" aria-label="조건 적합도 기준">
            {SCORE_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={minScore === item.value ? "active" : ""}
                onClick={() => {
                  setMinScore(item.value);
                  setResults([]);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="recommend-option-row">
            <span className="recommend-score-note">조건 적합도 {activeScoreFilter.label} · {activeScoreFilter.limit === 5 ? "상위 5개" : "전체"} 보기</span>
            <button type="button" className="primary-btn" onClick={handleRecommend} disabled={!selectedCustomer || loading || recommending}>
              {recommending ? "추천 중..." : "추천 매물 찾기"}
            </button>
          </div>
        </div>
      </section>

      {message ? <div className="schedule-inline-alert">{message}</div> : null}
      {copyMessage ? <div className="schedule-inline-alert success-alert">{copyMessage}</div> : null}

      <section className="recommend-results-section">
        <div className="section-heading-row">
          <div>
            <h2>추천 결과</h2>
          </div>
        </div>

        {recommending ? (
          <div className="recommend-empty-state loading-state">조건을 비교해서 추천 매물을 정리하는 중입니다.</div>
        ) : !selectedCustomer ? (
          <div className="recommend-empty-state">
            <strong>고객을 선택하고 추천 매물 찾기를 누르면 결과가 표시됩니다.</strong>
            <span>추천 결과는 등록된 매물과 고객 희망 조건을 비교해 점수 높은 순으로 보여줍니다.</span>
          </div>
        ) : !properties.length ? (
          <div className="recommend-empty-state">등록된 매물이 없어 추천할 수 없습니다.</div>
        ) : visibleResults.length ? (
          <>
            <div className="recommend-results-summary">
              <strong>입력한 고객 조건 기준으로 우선 검토할 매물 {visibleResults.length}개를 찾았습니다.</strong>
              <span>점수는 참고용이며, 정보가 부족한 항목은 현장 확인이 필요합니다.</span>
            </div>
            <div className="recommend-card-list">
              {visibleResults.map((result, index) => (
                <RecommendationCard
                  key={`${result.normalizedProperty.id || index}-${result.score}`}
                  rank={index + 1}
                  result={result}
                  onCopy={handleCopy}
                  onOpenBriefing={() => setPage?.("ai-briefing")}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="recommend-empty-state">현재 조건 적합도 기준에 맞는 매물이 없습니다. 70점, 55점, 전체보기 순서로 조건을 낮춰 보세요.</div>
        )}
      </section>
    </div>
  );
}

function CustomerConditionEditor({ customer, draft, onChange, editing, onEdit, onSave, onCancel, saving }) {
  return (
    <article className="customer-condition-card condition-editor-card">
      <div className="condition-editor-head">
        <strong>{customer.name} 고객 조건</strong>
        {editing ? (
          <div className="condition-editor-actions">
            <button type="button" className="secondary-btn small-btn" onClick={onCancel} disabled={saving}>
              취소
            </button>
            <button type="button" className="primary-btn small-btn" onClick={onSave} disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        ) : (
          <button type="button" className="secondary-btn small-btn" onClick={onEdit}>
            변경
          </button>
        )}
      </div>
      <div className="recommend-edit-grid">
        <label>
          <span>희망지역</span>
          <input value={draft.preferred_area} onChange={(event) => onChange("preferred_area", event.target.value)} placeholder="예: 역삼동" disabled={!editing || saving} />
        </label>
        <label>
          <span>매물 종류</span>
          <select value={draft.property_type} onChange={(event) => onChange("property_type", event.target.value)} disabled={!editing || saving}>
            {["사무실", "상가", "주거", "매매"].map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="wide">
          <span>찾는 조건</span>
          <textarea rows="3" value={draft.wanted_condition} onChange={(event) => onChange("wanted_condition", event.target.value)} placeholder="예: 월세, 보증금 2000만원 이하, 전용 50m2 이상, 주차 필요" disabled={!editing || saving} />
        </label>
        <label className="wide">
          <span>상담 메모</span>
          <textarea rows="2" value={draft.memo} onChange={(event) => onChange("memo", event.target.value)} placeholder="추천 시 참고할 메모" disabled={!editing || saving} />
        </label>
      </div>
      <p className="condition-editor-preview">
        {editing ? "수정 후 저장을 눌러야 고객관리 DB와 추천 조건에 반영됩니다." : customer.importantNotes || "변경을 눌러 추천 조건을 수정할 수 있습니다."}
      </p>
    </article>
  );
}

function ConditionSummary({ customer }) {
  const rows = [
    ["거래유형", customer.dealType || "확인 필요"],
    ["예산", formatBudget(customer)],
    ["지역", customer.locations.length ? customer.locations.join(", ") : "확인 필요"],
    ["면적", customer.minAreaM2 ? `${customer.minAreaM2}㎡ 이상` : "확인 필요"],
    ["주차", customer.parkingRequired ? "주차 필요" : "선택 조건 없음"],
    ["입주", customer.moveInDeadline || "미입력"],
    ["매물 종류", customer.raw?.property_type || customer.customerType || "미입력"],
  ];

  return (
    <dl className="recommend-condition-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CustomerSummary({ customer }) {
  const items = [
    { label: "거래유형", value: customer.dealType || "확인 필요" },
    { label: "예산", value: formatBudget(customer) },
    { label: "희망지역", value: customer.locations.length ? customer.locations.join(", ") : "확인 필요" },
    { label: "면적/방", value: [customer.minAreaM2 ? `${customer.minAreaM2}㎡ 이상` : "", customer.minRooms ? `방 ${customer.minRooms}개 이상` : ""].filter(Boolean).join(" · ") || "확인 필요" },
    { label: "옵션", value: [customer.parkingRequired ? "주차 필요" : "", customer.elevatorRequired ? "엘리베이터 필요" : ""].filter(Boolean).join(" · ") || "선택 조건 없음" },
    { label: "고객유형", value: customer.customerType || "미입력" },
  ];

  return (
    <article className="customer-condition-card">
      <strong>{customer.name} 고객 조건</strong>
      <div className="condition-chip-grid">
        {items.map((item) => (
          <span key={item.label}>
            <em>{item.label}</em>
            {item.value}
          </span>
        ))}
      </div>
      {customer.importantNotes ? <p>{customer.importantNotes}</p> : null}
    </article>
  );
}

function RecommendationCard({ rank, result, onCopy, onOpenBriefing }) {
  const [expanded, setExpanded] = useState(false);
  const property = result.normalizedProperty || normalizePropertyData(result.property);
  const imageUrl = property.imageUrl;
  const brochureUrl = result.property?.brochure_url || "";
  const goodPoints = (result.matchedReasons || []).slice(0, 3);
  const warnings = (result.warnings || []).slice(0, 3);
  const caps = result.capsApplied || [];
  const checkCount = new Set([...(result.warnings || []).map(shortLabel), ...(caps || []).map(shortLabel)].filter(Boolean)).size;
  const tags = [
    result.gradeLabel || gradeLabel(result.grade),
    ...goodPoints.slice(0, 2),
    ...(warnings.length ? [shortLabel(warnings[0])] : []),
  ].slice(0, 3);
  const oneLine = warnings.length
    ? `${goodPoints[0] || "조건 기준으로 검토 가능"} · ${shortLabel(warnings[0])}`
    : `${goodPoints[0] || "입력된 조건 기준으로 검토 가능한 매물입니다."}`;

  return (
    <article className={`recommend-card ${imageUrl ? "has-image" : "no-image"}`}>
      <div className={`recommend-media ${imageUrl ? "" : "is-empty"}`}>
        {imageUrl ? <img src={imageUrl} alt={property.title} /> : <span>이미지 없음</span>}
      </div>

      <div className="recommend-card-body">
        <div className="recommend-card-head">
          <div className="recommend-title-block">
            <div className="recommend-card-badges">
              <span className="rank-badge">추천 {rank}순위</span>
              <span className="deal-badge">{property.dealType || "거래유형 확인"}</span>
            </div>
            <h3>{property.title}</h3>
            <p>{property.address || "주소 정보 확인 필요"}</p>
          </div>
          <div className="fit-score-summary">
            <span className="fit-score-label">조건 적합도</span>
            <strong>{result.score}점</strong>
            <span className={`fit-grade-badge grade-${result.grade || "fair"}`}>{result.gradeLabel || gradeLabel(result.grade)}</span>
            <small>정보 완성도 {result.infoCompleteness ?? 0}점</small>
            <small>확인 필요 {checkCount}건</small>
          </div>
        </div>

        <p className="recommend-card-summary">{oneLine}</p>
        <div className="recommend-tag-row">
          {tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <div className="recommend-price-line">{property.priceSummary || "가격 확인 필요"}</div>
        <div className="recommend-score-meta">
          <em>점수는 참고용이며, 부족한 정보는 현장 확인이 필요합니다.</em>
        </div>

        <div className="recommend-reason-grid">
          <ReasonList title="좋은 점" items={goodPoints} empty="좋은 점을 계산하려면 조건 정보가 더 필요합니다." />
          <ReasonList title="주의점" items={warnings} empty="특별한 주의사항이 없습니다." />
        </div>

        {expanded ? (
          <div className="recommend-detail-panel">
            <ReasonList title="확인 필요 항목" items={warnings.map(shortLabel)} empty="추가 확인 필요 항목 없음" />
            <ReasonList title="적용된 상한선" items={caps} empty="적용된 상한선 없음" />
            <div className="customer-message-box">
              <div>
                <span>고객용 문구</span>
                <button type="button" className="secondary-btn small-btn" onClick={() => onCopy(result.customerMessage)}>
                  복사
                </button>
              </div>
              <p>{result.customerMessage}</p>
            </div>
            <div className="recommend-detail-info">
              <span>{property.address || "주소 확인 필요"}</span>
              <span>{property.areaM2 ? `${property.areaM2}㎡` : "면적 확인 필요"}</span>
              <span>{property.floor || "층수 확인 필요"}</span>
            </div>
          </div>
        ) : null}

        <div className="recommend-actions">
          <button type="button" className="primary-btn" onClick={onOpenBriefing}>
            AI 브리핑 만들기
          </button>
          <button type="button" className="secondary-btn" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "상세 접기" : "상세 보기"}
          </button>
          {brochureUrl ? (
            <a className="secondary-btn recommend-link-btn" href={brochureUrl} target="_blank" rel="noreferrer">
              소개서 보기
            </a>
          ) : (
            <button type="button" className="ghost-btn recommend-disabled-btn" disabled>
              소개서 없음
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function ReasonList({ title, items, empty }) {
  return (
    <div className="recommend-reason-list">
      <strong>{title}</strong>
      {items?.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}

function shortLabel(item = "") {
  return String(item)
    .replace(/고객\s*/g, "")
    .replace(/매물\s*/g, "")
    .replace(/정보\s*/g, "")
    .replace(/확인\s*필요/g, "확인 필요")
    .replace(/주소\/지역.*부족/g, "위치 확인 필요")
    .replace(/가격.*부족/g, "가격 확인 필요")
    .replace(/면적.*부족/g, "면적 확인 필요")
    .trim();
}

function gradeLabel(grade) {
  return {
    excellent: "우선 추천",
    good: "검토 추천",
    fair: "조건 일부 불일치",
    risky: "추천 주의",
  }[grade] || "검토";
}

function formatBudget(customer) {
  const parts = [];
  if (customer.maxPrice) parts.push(`금액 ${customer.maxPrice.toLocaleString("ko-KR")}만원 이하`);
  if (customer.maxDeposit) parts.push(`보증금 ${customer.maxDeposit.toLocaleString("ko-KR")}만원 이하`);
  if (customer.maxMonthlyRent) parts.push(`월세 ${customer.maxMonthlyRent.toLocaleString("ko-KR")}만원 이하`);
  return parts.join(" · ") || "확인 필요";
}

export default AIPropertyRecommendPage;
