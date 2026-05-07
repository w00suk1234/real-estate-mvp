import { useEffect, useMemo, useState } from "react";
import { listCustomers, listProperties } from "../services/supabaseRepository";
import { generateRecommendationSummary } from "../services/aiRecommendationService";
import {
  hasEnoughCustomerCondition,
  normalizeCustomerCondition,
  normalizePropertyData,
  recommendPropertiesForCustomer,
} from "../utils/recommendProperties";

const SELECTED_CUSTOMER_KEY = "agentnote_recommend_customer_id";

function AIPropertyRecommendPage({ setPage }) {
  const [customers, setCustomers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [results, setResults] = useState([]);
  const [topLimit, setTopLimit] = useState(3);
  const [message, setMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [recommending, setRecommending] = useState(false);

  useEffect(() => {
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
  }, []);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => String(customer.id) === String(selectedCustomerId)) || null,
    [customers, selectedCustomerId],
  );

  const customerCondition = useMemo(
    () => (selectedCustomer ? normalizeCustomerCondition(selectedCustomer) : null),
    [selectedCustomer],
  );

  const visibleResults = results.slice(0, topLimit);

  const handleCustomerChange = (value) => {
    setSelectedCustomerId(value);
    setResults([]);
    setMessage("");
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
      const recommended = recommendPropertiesForCustomer(selectedCustomer, properties, { limit: 5, minScore: 20 });
      const summarized = generateRecommendationSummary(selectedCustomer, recommended);
      setResults(summarized);

      if (!hasEnoughCustomerCondition(selectedCustomer)) {
        setMessage("고객 희망 조건이 부족합니다. 예산, 희망지역, 거래유형 등을 입력하면 더 정확하게 추천할 수 있습니다.");
        return;
      }

      if (!summarized.length) {
        setMessage("현재 조건에 정확히 맞는 매물이 없습니다. 조건을 완화해 보세요.");
        return;
      }

      setMessage(`${summarized.length}개의 추천 매물을 찾았습니다.`);
    } catch (error) {
      setMessage(error.message || "추천 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setRecommending(false);
    }
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
          <span className="page-eyebrow">AI 매물 추천기</span>
          <h1>AI 매물 추천기</h1>
          <p>고객 희망 조건을 기준으로 등록된 매물 중 적합한 매물을 추천합니다.</p>
        </div>
        <span className="zero-cost-badge">Rule-based · API 호출 0회</span>
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
            <select value={selectedCustomerId} onChange={(event) => handleCustomerChange(event.target.value)} disabled={loading}>
              <option value="">{loading ? "고객 목록을 불러오는 중입니다" : "추천할 고객을 선택해 주세요"}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name || "이름 없음"} {customer.phone ? `· ${customer.phone}` : ""}
                </option>
              ))}
            </select>
          </label>

          {selectedCustomer ? <CustomerSummary customer={customerCondition} /> : <div className="recommend-empty-note"><strong>추천할 고객을 먼저 선택해 주세요.</strong><span>고객관리의 희망 지역, 예산, 매물 종류가 추천 조건으로 사용됩니다.</span></div>}
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
          <div className="recommend-option-row">
            <label className="toggle-check">
              <input type="checkbox" checked={topLimit === 5} onChange={(event) => setTopLimit(event.target.checked ? 5 : 3)} />
              TOP 5까지 보기
            </label>
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
            <p>추천 점수 높은 순으로 표시합니다.</p>
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
          <div className="recommend-card-list">
            {visibleResults.map((result, index) => (
              <RecommendationCard
                key={`${result.normalizedProperty.id || index}-${result.score}`}
                rank={index + 1}
                result={result}
                onCopy={handleCopy}
                onOpenBriefing={() => setPage?.("briefing")}
              />
            ))}
          </div>
        ) : (
          <div className="recommend-empty-state">현재 조건에 정확히 맞는 매물이 없습니다. 조건을 완화해 보세요.</div>
        )}
      </section>
    </div>
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
  const property = result.normalizedProperty || normalizePropertyData(result.property);
  const imageUrl = property.imageUrl;
  const brochureUrl = result.property?.brochure_url || "";

  return (
    <article className="recommend-card">
      <div className="recommend-media">
        {imageUrl ? <img src={imageUrl} alt={property.title} /> : <span>이미지 없음</span>}
        <em>추천 {rank}순위</em>
      </div>

      <div className="recommend-card-body">
        <div className="recommend-card-head">
          <div>
            <span>{property.dealType || "거래유형 확인"}</span>
            <h3>{property.title}</h3>
            <p>{property.address || "주소 정보 확인 필요"}</p>
          </div>
          <strong>{result.matchPercent}%</strong>
        </div>

        <div className="recommend-price-line">{property.priceSummary || "가격 확인 필요"}</div>

        <div className="recommend-reason-grid">
          <ReasonList title="추천 이유" items={result.matchedReasons} empty="추천 이유를 계산하려면 조건 정보가 더 필요합니다." />
          <ReasonList title="주의사항" items={result.warnings} empty="특별한 주의사항이 없습니다." />
        </div>

        <div className="customer-message-box">
          <span>고객용 문구</span>
          <p>{result.customerMessage}</p>
        </div>

        <div className="recommend-actions">
          <button type="button" className="secondary-btn" onClick={() => onCopy(result.customerMessage)}>
            고객용 문구 복사
          </button>
          {brochureUrl ? (
            <a className="primary-btn recommend-link-btn" href={brochureUrl} target="_blank" rel="noreferrer">
              소개서 보기
            </a>
          ) : (
            <button type="button" className="primary-btn" onClick={onOpenBriefing}>
              소개서 보기
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

function formatBudget(customer) {
  const parts = [];
  if (customer.maxPrice) parts.push(`금액 ${customer.maxPrice.toLocaleString("ko-KR")}만원 이하`);
  if (customer.maxDeposit) parts.push(`보증금 ${customer.maxDeposit.toLocaleString("ko-KR")}만원 이하`);
  if (customer.maxMonthlyRent) parts.push(`월세 ${customer.maxMonthlyRent.toLocaleString("ko-KR")}만원 이하`);
  return parts.join(" · ") || "확인 필요";
}

export default AIPropertyRecommendPage;
