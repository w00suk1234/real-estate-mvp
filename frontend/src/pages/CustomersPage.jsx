import { useEffect, useMemo, useState } from "react";
import { deleteCustomer, listCustomers, listSchedules, saveCustomer, saveSchedule } from "../services/supabaseRepository";

const CONTRACT_STATUSES = ["미계약", "계약금입금", "계약서일정", "잔금완료", "정산완료", "파토", "삭제"];
const PRIORITY_LEVELS = ["낮음", "보통", "높음"];
const PROPERTY_TYPE_OPTIONS = ["사무실", "상가", "주거", "매매"];
const ALL = "전체";

const defaultForm = {
  name: "",
  phone: "",
  preferred_area: "",
  property_type: "사무실",
  wanted_condition: "",
  contract_status: "미계약",
  priority: "보통",
  source: "직접 입력",
  inflow_date: "",
  memo: "",
};

function getStatusClass(status) {
  if (status === "계약금입금") return "deposit";
  if (status === "계약서일정") return "contract";
  if (status === "잔금완료" || status === "정산완료") return "complete";
  if (status === "삭제" || status === "파토") return "deleted";
  return "default";
}

function getCustomerValue(item, key) {
  if (key === "wanted_condition") return item.wanted_condition || item.requirement || "";
  if (key === "memo") return item.memo || item.notes || "";
  if (key === "inflow_date") return item.inflow_date || item.inquiry_date || "";
  if (key === "preferred_area") return item.preferred_area || item.area || String(item.wanted_condition || "").split(/[,\s]/)[0] || "";
  if (key === "property_type") return item.property_type || item.propertyType || "사무실";
  return item[key] || "";
}

function formatDate(dateString) {
  if (!dateString) return "유입일 미입력";
  return dateString;
}

function getMonthKey(item) {
  const date = getCustomerValue(item, "inflow_date") || item.created_at || "";
  return typeof date === "string" && date.length >= 7 ? date.slice(0, 7) : "";
}

function mergeMemoOnce(baseMemo, nextMemo) {
  const base = (baseMemo || "").trim();
  const next = (nextMemo || "").trim();
  if (!next) return base;
  if (!base) return next;
  if (base.includes(next)) return base;
  return `${base}\n${next}`;
}

const RECOMMEND_CUSTOMER_KEY = "agentnote_recommend_customer_id";

function CustomersPage({ setPage: navigatePage }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [priorityFilter, setPriorityFilter] = useState(ALL);
  const [propertyTypeFilter, setPropertyTypeFilter] = useState(ALL);
  const [monthFilter, setMonthFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function fetchCustomers() {
    try {
      const data = await listCustomers();
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessage(error.message || "고객 목록을 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return items.filter((item) => {
      const haystack = [
        getCustomerValue(item, "name"),
        getCustomerValue(item, "phone"),
        getCustomerValue(item, "preferred_area"),
        getCustomerValue(item, "property_type"),
        getCustomerValue(item, "wanted_condition"),
        getCustomerValue(item, "memo"),
        getCustomerValue(item, "source"),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !keyword || haystack.includes(keyword);
      const matchesStatus = statusFilter === ALL || getCustomerValue(item, "contract_status") === statusFilter;
      const matchesPriority = priorityFilter === ALL || getCustomerValue(item, "priority") === priorityFilter;
      const matchesPropertyType = propertyTypeFilter === ALL || getCustomerValue(item, "property_type") === propertyTypeFilter;
      const matchesMonth = !monthFilter || getMonthKey(item) === monthFilter;

      return matchesSearch && matchesStatus && matchesPriority && matchesPropertyType && matchesMonth;
    });
  }, [items, monthFilter, priorityFilter, propertyTypeFilter, search, statusFilter]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const resetFilters = () => {
    setSearch("");
    setStatusFilter(ALL);
    setPriorityFilter(ALL);
    setPropertyTypeFilter(ALL);
    setMonthFilter("");
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setForm({
      ...defaultForm,
      ...item,
      property_type: getCustomerValue(item, "property_type") || "사무실",
      wanted_condition: getCustomerValue(item, "wanted_condition"),
      memo: getCustomerValue(item, "memo"),
      inflow_date: getCustomerValue(item, "inflow_date"),
    });
    setMessage("수정할 고객 정보를 불러왔습니다.");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("고객을 삭제할까요?")) return;
    try {
      await deleteCustomer(id);
      await fetchCustomers();
      if (editingId === id) resetForm();
    } catch (error) {
      setMessage(error.message || "고객 삭제에 실패했습니다.");
    }
  };

  const openRecommendation = (customer) => {
    if (!customer?.id) return;
    localStorage.setItem(RECOMMEND_CUSTOMER_KEY, customer.id);
    window.history.pushState({}, "", `/ai-recommend?customerId=${encodeURIComponent(customer.id)}`);
    navigatePage?.("ai-recommend");
  };

  const createInflowSchedule = async (customer) => {
    const inflowDate = getCustomerValue(customer, "inflow_date");
    const customerName = getCustomerValue(customer, "name");
    if (!inflowDate || !customerName) return;

    const schedules = await listSchedules();
    const existingSchedule = Array.isArray(schedules)
      ? schedules.find(
          (schedule) =>
            schedule.schedule_type === "고객인입" &&
            (schedule.customer_id === customer.id ||
              (!schedule.customer_id && schedule.customer_name === customerName && schedule.schedule_date === inflowDate)),
        )
      : null;

    const nextNote = [
      getCustomerValue(customer, "phone"),
      getCustomerValue(customer, "property_type"),
      getCustomerValue(customer, "wanted_condition"),
      getCustomerValue(customer, "memo"),
    ]
      .filter(Boolean)
      .join("\n");

    await saveSchedule({
      id: existingSchedule?.id,
      title: `${customerName} 고객인입`,
      customer_id: customer.id,
      customer_name: customerName,
      schedule_date: inflowDate,
      schedule_time: "12:00",
      schedule_type: "고객인입",
      note: mergeMemoOnce(existingSchedule?.note, nextNote),
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!form.name.trim()) {
      setMessage("고객명을 입력해 주세요.");
      return;
    }

    try {
      setSaving(true);
      const wasEditing = Boolean(editingId);
      const saved = await saveCustomer({ ...form, property_type: form.property_type || "사무실", id: editingId || undefined });
      let scheduleSynced = true;
      try {
        await createInflowSchedule(saved);
      } catch (scheduleError) {
        console.error(scheduleError);
        scheduleSynced = false;
      }
      await fetchCustomers();
      resetForm();
      setMessage(
        scheduleSynced
          ? wasEditing
            ? "고객 정보를 수정했습니다."
            : "고객을 등록했습니다."
          : "고객은 등록했습니다. 다만 일정관리 자동 연동은 실패해 별도 확인이 필요합니다.",
      );
    } catch (error) {
      setMessage(error.message || "고객 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="page-header-card compact-page-header">
        <div>
          <h1>고객관리</h1>
          <p>고객 목록을 중심으로 상담 상태와 유입 일정을 관리합니다.</p>
        </div>
      </section>

      <section className="customer-layout">
        <div className="customer-list-card">
          <div className="section-heading-row">
            <div>
              <h2>고객 목록</h2>
              <p>현재 총 {items.length}명의 고객 DB가 있고, 조건에 맞는 {filteredItems.length}명을 표시합니다.</p>
            </div>
          </div>

          <div className="customer-filter-grid customer-filter-grid-extended">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="고객명, 연락처, 희망 지역 검색" />
            <input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} aria-label="월별 조회" />
            <select value={propertyTypeFilter} onChange={(event) => setPropertyTypeFilter(event.target.value)}>
              {[ALL, ...PROPERTY_TYPE_OPTIONS].map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {[ALL, ...CONTRACT_STATUSES].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
              {[ALL, ...PRIORITY_LEVELS].map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
            <button type="button" className="secondary-btn small-btn" onClick={resetFilters}>
              초기화
            </button>
          </div>

          <div className="customer-card-list">
            {filteredItems.length ? (
              filteredItems.map((item) => {
                const status = getCustomerValue(item, "contract_status") || "미계약";
                return (
                  <article key={item.id} className={`customer-card-item contract-strip-${getStatusClass(status)}`}>
                    <div className="customer-card-head">
                      <div>
                        <strong>{getCustomerValue(item, "name") || "이름 없음"}</strong>
                        <span>{getCustomerValue(item, "phone") || "연락처 미입력"}</span>
                      </div>
                      <span className={`status-badge status-${getStatusClass(status)}`}>{status}</span>
                    </div>

                    <div className="customer-meta-grid">
                      <span>매물</span>
                      <p>{getCustomerValue(item, "property_type") || "사무실"}</p>
                      <span>희망 지역</span>
                      <p>{getCustomerValue(item, "preferred_area") || "미입력"}</p>
                      <span>중요도</span>
                      <p>{getCustomerValue(item, "priority") || "보통"}</p>
                      <span>유입일</span>
                      <p>{formatDate(getCustomerValue(item, "inflow_date"))}</p>
                    </div>

                    {getCustomerValue(item, "wanted_condition") ? (
                      <p className="customer-note">{getCustomerValue(item, "wanted_condition")}</p>
                    ) : null}
                    {getCustomerValue(item, "memo") ? <p className="customer-note muted">{getCustomerValue(item, "memo")}</p> : null}

                    <div className="customer-actions">
                      <button type="button" className="primary-btn small-btn" onClick={() => openRecommendation(item)}>
                        AI 매물 추천기에서 추천 보기
                      </button>
                      <div className="customer-action-pair">
                        <button type="button" className="secondary-btn small-btn" onClick={() => handleEdit(item)}>
                          수정
                        </button>
                        <button type="button" className="danger-btn small-btn" onClick={() => handleDelete(item.id)}>
                          삭제
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="empty-state">조건에 맞는 고객이 없습니다.</div>
            )}
          </div>
        </div>

        <form className="customer-form-card" onSubmit={handleSubmit}>
          <div className="section-heading-row">
            <div>
              <h2>{editingId ? "고객 수정" : "빠른 고객 등록"}</h2>
              <p>고객 유입일을 넣으면 일정관리에도 고객인입 일정이 생성됩니다.</p>
            </div>
          </div>

          <label className="field">
            <span>고객명</span>
            <input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="예: 김고객" />
          </label>
          <label className="field">
            <span>연락처</span>
            <input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} placeholder="예: 010-1234-5678" />
          </label>
          <label className="field">
            <span>희망 지역</span>
            <input value={form.preferred_area} onChange={(event) => updateField("preferred_area", event.target.value)} placeholder="예: 강남구 역삼동" />
          </label>
          <label className="field">
            <span>매물 종류</span>
            <select value={form.property_type || "사무실"} onChange={(event) => updateField("property_type", event.target.value)}>
              {PROPERTY_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>찾는 조건</span>
            <textarea
              rows="3"
              value={form.wanted_condition}
              onChange={(event) => updateField("wanted_condition", event.target.value)}
              placeholder="예: 주차 가능, 역세권, 전용 20평 이내"
            />
          </label>
          <label className="field">
            <span>고객 유입일</span>
            <input type="date" value={form.inflow_date} onChange={(event) => updateField("inflow_date", event.target.value)} />
          </label>
          <div className="compact-select-grid">
            <label className="field">
              <span>계약상태</span>
              <select value={form.contract_status} onChange={(event) => updateField("contract_status", event.target.value)}>
                {CONTRACT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>중요도</span>
              <select value={form.priority} onChange={(event) => updateField("priority", event.target.value)}>
                {PRIORITY_LEVELS.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>메모</span>
            <textarea rows="3" value={form.memo} onChange={(event) => updateField("memo", event.target.value)} placeholder="상담 내용 메모" />
          </label>

          {message ? <div className="schedule-inline-alert">{message}</div> : null}

          <div className="form-actions inline-actions">
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? "저장 중..." : editingId ? "수정 저장" : "고객 등록"}
            </button>
            {editingId ? (
              <button type="button" className="secondary-btn" onClick={resetForm}>
                취소
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}

export default CustomersPage;
