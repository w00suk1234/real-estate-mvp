import { useEffect, useMemo, useState } from "react";
import { deleteCustomer, listCustomers, saveCustomer, saveSchedule } from "../services/supabaseRepository";

const PROPERTY_TYPES = ["사무실", "상가", "주거", "매매"];
const CONTRACT_STATUSES = ["미계약", "계약금입금", "계약서일정", "잔금완료", "정산완료", "삭제"];
const PRIORITIES = ["보통", "높음", "낮음"];
const MEETING_STATUSES = ["미팅 전", "미팅 예정", "미팅 완료"];
const PAGE_SIZE = 10;

const DEFAULT_FORM = {
  id: "",
  name: "",
  phone: "",
  preferred_area: "",
  property_type: "사무실",
  wanted_condition: "",
  inflow_date: "",
  contract_status: "미계약",
  priority: "보통",
  meeting_status: "미팅 전",
  memo: "",
  source: "",
};

function getStatusClass(status) {
  if (status === "계약금입금") return "deposit";
  if (status === "계약서일정") return "contract";
  if (status === "잔금완료" || status === "정산완료") return "complete";
  if (status === "삭제") return "deleted";
  return "pending";
}

function getMonthValue(value) {
  return value ? String(value).slice(0, 7) : "";
}

function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [filters, setFilters] = useState({
    search: "",
    month: "",
    propertyType: "",
    status: "",
    priority: "",
    meeting: "",
  });
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const loadCustomers = async () => {
    const rows = await listCustomers();
    setCustomers(rows);
  };

  useEffect(() => {
    loadCustomers().catch((error) => setMessage(error.message));
  }, []);

  const filteredCustomers = useMemo(() => {
    const keyword = filters.search.trim().toLowerCase();
    return customers.filter((customer) => {
      const haystack = [
        customer.name,
        customer.phone,
        customer.preferred_area,
        customer.property_type,
        customer.wanted_condition,
        customer.memo,
      ].filter(Boolean).join(" ").toLowerCase();
      if (keyword && !haystack.includes(keyword)) return false;
      if (filters.month && getMonthValue(customer.inflow_date || customer.created_at) !== filters.month) return false;
      if (filters.propertyType && customer.property_type !== filters.propertyType) return false;
      if (filters.status && customer.contract_status !== filters.status) return false;
      if (filters.priority && customer.priority !== filters.priority) return false;
      if (filters.meeting && customer.meeting_status !== filters.meeting) return false;
      return true;
    });
  }, [customers, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageCustomers = filteredCustomers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm(DEFAULT_FORM);
  };

  const editCustomer = (customer) => {
    setForm({
      id: customer.id || "",
      name: customer.name || "",
      phone: customer.phone || "",
      preferred_area: customer.preferred_area || "",
      property_type: customer.property_type || "사무실",
      wanted_condition: customer.wanted_condition || "",
      inflow_date: customer.inflow_date || "",
      contract_status: customer.contract_status || "미계약",
      priority: customer.priority || "보통",
      meeting_status: customer.meeting_status || "미팅 전",
      memo: customer.memo || "",
      source: customer.source || "",
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setMessage("고객명을 입력해 주세요.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const isNew = !form.id;
      const saved = await saveCustomer({
        ...form,
        name: form.name.trim(),
        phone: form.phone.trim(),
        preferred_area: form.preferred_area.trim(),
        wanted_condition: form.wanted_condition.trim(),
        memo: form.memo.trim(),
        source: form.source || "직접 등록",
      });

      if (isNew && form.inflow_date) {
        await saveSchedule({
          title: (saved.name || form.name) + " 고객인입",
          schedule_date: form.inflow_date,
          schedule_time: "",
          schedule_type: "고객인입",
          note: form.memo.trim(),
          customer_id: saved.id,
          customer_name: saved.name || form.name,
        });
      }

      await loadCustomers();
      resetForm();
      setMessage("고객 정보가 저장되었습니다.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (customer) => {
    const confirmed = window.confirm("고객 정보를 삭제할까요?");
    if (!confirmed) return;
    await deleteCustomer(customer.id);
    await loadCustomers();
  };

  return (
    <div className="page-content page-content-wide">
      <div className="page-header compact-page-header">
        <div>
          <span className="eyebrow">고객 데이터</span>
          <h1>고객관리</h1>
          <p>유입 고객을 등록하고 월별·매물종류별로 빠르게 조회합니다.</p>
        </div>
      </div>

      <div className="customer-layout">
        <section className="customer-list-panel">
          <div className="panel-title-row">
            <div>
              <h2>고객목록</h2>
              <p>총 {filteredCustomers.length}명</p>
            </div>
          </div>

          <div className="customer-filter-grid">
            <input value={filters.search} onChange={(event) => { setFilters((prev) => ({ ...prev, search: event.target.value })); setPage(1); }} placeholder="고객명, 연락처, 희망지역 검색" />
            <input type="month" value={filters.month} onChange={(event) => { setFilters((prev) => ({ ...prev, month: event.target.value })); setPage(1); }} aria-label="월별 조회" />
            <select value={filters.propertyType} onChange={(event) => { setFilters((prev) => ({ ...prev, propertyType: event.target.value })); setPage(1); }}>
              <option value="">매물종류 전체</option>
              {PROPERTY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select value={filters.status} onChange={(event) => { setFilters((prev) => ({ ...prev, status: event.target.value })); setPage(1); }}>
              <option value="">계약상태 전체</option>
              {CONTRACT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select value={filters.priority} onChange={(event) => { setFilters((prev) => ({ ...prev, priority: event.target.value })); setPage(1); }}>
              <option value="">중요도 전체</option>
              {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
            <select value={filters.meeting} onChange={(event) => { setFilters((prev) => ({ ...prev, meeting: event.target.value })); setPage(1); }}>
              <option value="">미팅 전체</option>
              {MEETING_STATUSES.map((meeting) => <option key={meeting} value={meeting}>{meeting}</option>)}
            </select>
          </div>

          {pageCustomers.length ? (
            <div className="customer-card-list">
              {pageCustomers.map((customer) => (
                <article key={customer.id} className={"customer-card-item status-" + getStatusClass(customer.contract_status)}>
                  <div>
                    <strong>{customer.name || "이름 없음"}</strong>
                    <span>{customer.phone || "연락처 없음"}</span>
                  </div>
                  <div className="customer-meta-grid">
                    <span>{customer.preferred_area || "희망지역 미입력"}</span>
                    <span>{customer.property_type || "사무실"}</span>
                    <span>{customer.inflow_date || "유입일 미입력"}</span>
                    <span className={"customer-status-badge " + getStatusClass(customer.contract_status)}>{customer.contract_status || "미계약"}</span>
                  </div>
                  <p>{customer.wanted_condition || customer.memo || "상담 조건이 아직 없습니다."}</p>
                  <div className="customer-actions">
                    <button type="button" className="secondary-button" onClick={() => editCustomer(customer)}>수정</button>
                    <button type="button" className="danger-button" onClick={() => handleDelete(customer)}>삭제</button>
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="empty-state">조건에 맞는 고객이 없습니다.</div>}

          <div className="pagination">
            <button type="button" className="secondary-button" disabled={currentPage === 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>이전</button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 5).map((pageNumber) => (
              <button type="button" key={pageNumber} className={currentPage === pageNumber ? "primary-button" : "secondary-button"} onClick={() => setPage(pageNumber)}>{pageNumber}</button>
            ))}
            <button type="button" className="secondary-button" disabled={currentPage === totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>다음</button>
          </div>
        </section>

        <section className="customer-form-card">
          <h2>빠른 고객 등록</h2>
          <form onSubmit={handleSubmit}>
            <label>고객명<input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="예: 김은수" /></label>
            <label>연락처<input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="010-0000-0000" /></label>
            <label>희망 지역<input value={form.preferred_area} onChange={(event) => updateForm("preferred_area", event.target.value)} placeholder="예: 역삼동" /></label>
            <label>매물종류<select value={form.property_type} onChange={(event) => updateForm("property_type", event.target.value)}>{PROPERTY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <label>찾는 조건<input value={form.wanted_condition} onChange={(event) => updateForm("wanted_condition", event.target.value)} placeholder="예: 30평대 사무실" /></label>
            <label>고객 유입일<input type="date" value={form.inflow_date} onChange={(event) => updateForm("inflow_date", event.target.value)} /></label>
            <label>계약상태<select value={form.contract_status} onChange={(event) => updateForm("contract_status", event.target.value)}>{CONTRACT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <label>중요도<select value={form.priority} onChange={(event) => updateForm("priority", event.target.value)}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
            <label>미팅 여부<select value={form.meeting_status} onChange={(event) => updateForm("meeting_status", event.target.value)}>{MEETING_STATUSES.map((meeting) => <option key={meeting} value={meeting}>{meeting}</option>)}</select></label>
            <label>메모<textarea value={form.memo} onChange={(event) => updateForm("memo", event.target.value)} placeholder="상담 메모를 입력하세요." /></label>
            {message ? <p className="form-message">{message}</p> : null}
            <div className="inline-actions">
              <button type="submit" className="primary-button" disabled={saving}>{saving ? "저장 중" : form.id ? "고객 수정" : "고객 등록"}</button>
              <button type="button" className="secondary-button" onClick={resetForm}>초기화</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

export default CustomersPage;
