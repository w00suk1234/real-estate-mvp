import { useEffect, useMemo, useState } from "react";
import { listCustomers, listSchedules } from "../services/supabaseRepository";

const STORAGE_KEY = "real_estate_mvp_settlement_entries";
const today = new Date();

function toMonthInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function readLedger() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLedger(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatWon(value) {
  return `${new Intl.NumberFormat("ko-KR").format(Number(value) || 0)}원`;
}

function sumBy(items, getter) {
  return items.reduce((total, item) => total + (Number(getter(item)) || 0), 0);
}

function isSameMonth(dateString, monthValue) {
  return String(dateString || "").startsWith(monthValue);
}

function emptyForm(monthValue) {
  return {
    id: "",
    date: `${monthValue || toMonthInputValue(today)}-${String(today.getDate()).padStart(2, "0")}`,
    customer_name: "",
    title: "",
    commission_amount: "",
    expected_amount: "",
    status: "예상",
    memo: "",
  };
}

function SettlementPage() {
  const [month, setMonth] = useState(toMonthInputValue(today));
  const [customers, setCustomers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [ledger, setLedger] = useState(() => readLedger());
  const [form, setForm] = useState(() => emptyForm(toMonthInputValue(today)));
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [customerRows, scheduleRows] = await Promise.all([listCustomers(), listSchedules()]);
        setCustomers(Array.isArray(customerRows) ? customerRows : []);
        setSchedules(Array.isArray(scheduleRows) ? scheduleRows : []);
      } catch (error) {
        setMessage(error.message || "정산 데이터를 불러오지 못했습니다.");
      }
    }

    load();
  }, []);

  const monthLedger = useMemo(
    () => ledger.filter((item) => isSameMonth(item.date, month)),
    [ledger, month],
  );

  const stats = useMemo(() => {
    const customerInflow = customers.filter((customer) => isSameMonth(customer.inflow_date || customer.inquiry_date, month)).length;
    const scheduleInflow = schedules.filter((schedule) => isSameMonth(schedule.schedule_date, month) && schedule.schedule_type === "고객인입").length;
    const contractCustomers = customers.filter(
      (customer) => isSameMonth(customer.inflow_date || customer.inquiry_date, month) && ["계약금입금", "잔금완료"].includes(customer.contract_status),
    ).length;
    const contractSchedules = schedules.filter(
      (schedule) => isSameMonth(schedule.schedule_date, month) && ["계약서작성", "계약금입금", "잔금날"].includes(schedule.schedule_type),
    ).length;
    const confirmedRevenue = sumBy(monthLedger.filter((item) => item.status === "정산완료"), (item) => item.commission_amount);
    const expectedRevenue =
      confirmedRevenue +
      sumBy(monthLedger.filter((item) => item.status !== "정산완료"), (item) => item.expected_amount || item.commission_amount);

    return {
      inflowCount: Math.max(customerInflow, scheduleInflow),
      contractCount: Math.max(contractCustomers, contractSchedules),
      confirmedRevenue,
      expectedRevenue,
    };
  }, [customers, month, monthLedger, schedules]);

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleMonthChange = (value) => {
    setMonth(value);
    setForm((prev) => ({ ...prev, date: `${value}-${String(today.getDate()).padStart(2, "0")}` }));
  };

  const resetForm = () => {
    setForm(emptyForm(month));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.title.trim() && !form.customer_name.trim()) {
      setMessage("고객명 또는 정산명을 입력해 주세요.");
      return;
    }

    const entry = {
      ...form,
      title: form.title.trim() || `${form.customer_name.trim()} 정산`,
      commission_amount: Number(form.commission_amount) || 0,
      expected_amount: Number(form.expected_amount) || Number(form.commission_amount) || 0,
    };
    const next = entry.id
      ? ledger.map((item) => (item.id === entry.id ? entry : item))
      : [{ ...entry, id: createId(), created_at: new Date().toISOString() }, ...ledger];

    setLedger(next);
    writeLedger(next);
    resetForm();
    setMessage(entry.id ? "정산 내역을 수정했습니다." : "정산 내역을 추가했습니다.");
  };

  const handleEdit = (entry) => {
    setForm({
      ...emptyForm(month),
      ...entry,
      commission_amount: String(entry.commission_amount || ""),
      expected_amount: String(entry.expected_amount || ""),
    });
  };

  const handleDelete = (id) => {
    if (!window.confirm("정산 내역을 삭제할까요?")) return;
    const next = ledger.filter((item) => item.id !== id);
    setLedger(next);
    writeLedger(next);
    setMessage("정산 내역을 삭제했습니다.");
  };

  return (
    <div className="page-stack settlement-page">
      <section className="page-header-card compact-page-header settlement-header">
        <div>
          <span className="page-eyebrow">정산</span>
          <h1>월별 정산 가계부</h1>
          <p>월별 손님 인입, 계약 흐름, 수수료 매출과 이번 달 예상 정산금액을 같이 확인합니다.</p>
        </div>
        <input className="month-input settlement-month-input" type="month" value={month} onChange={(event) => handleMonthChange(event.target.value)} />
      </section>

      <section className="settlement-stat-grid">
        <StatCard label="손님 인입건수" value={`${stats.inflowCount}건`} tone="inflow" />
        <StatCard label="계약건수" value={`${stats.contractCount}건`} tone="contract" />
        <StatCard label="정산 완료 매출" value={formatWon(stats.confirmedRevenue)} tone="balance" />
        <StatCard label="이번달 예상금액" value={formatWon(stats.expectedRevenue)} tone="meeting" />
      </section>

      <section className="settlement-layout">
        <div className="settlement-table-card">
          <div className="section-heading-row">
            <div>
              <h2>수수료 정산 매출표</h2>
              <p>{monthLedger.length}건의 정산 내역</p>
            </div>
          </div>

          <div className="settlement-table">
            {monthLedger.length ? (
              monthLedger.map((entry) => (
                <article key={entry.id} className={`settlement-row ${entry.status === "정산완료" ? "is-done" : "is-expected"}`}>
                  <div>
                    <span>{entry.date}</span>
                    <strong>{entry.title}</strong>
                    <p>{entry.customer_name || "고객명 미입력"}</p>
                  </div>
                  <div>
                    <span>정산금</span>
                    <strong>{formatWon(entry.commission_amount)}</strong>
                  </div>
                  <div>
                    <span>예상금</span>
                    <strong>{formatWon(entry.expected_amount || entry.commission_amount)}</strong>
                  </div>
                  <em>{entry.status}</em>
                  <div className="inline-actions">
                    <button type="button" className="secondary-btn small-btn" onClick={() => handleEdit(entry)}>
                      수정
                    </button>
                    <button type="button" className="danger-btn small-btn" onClick={() => handleDelete(entry.id)}>
                      삭제
                    </button>
                  </div>
                  {entry.memo ? <p className="settlement-memo">{entry.memo}</p> : null}
                </article>
              ))
            ) : (
              <div className="empty-state">이번 달 정산 내역이 없습니다.</div>
            )}
          </div>
        </div>

        <form className="settlement-form-card" onSubmit={handleSubmit}>
          <div className="section-heading-row">
            <div>
              <h2>{form.id ? "정산 수정" : "정산 추가"}</h2>
              <p>예상 건은 예상금액에, 완료 건은 정산금에 입력하면 월 합계에 반영됩니다.</p>
            </div>
          </div>

          <label className="field">
            <span>정산일</span>
            <input type="date" value={form.date} onChange={(event) => updateForm("date", event.target.value)} />
          </label>
          <label className="field">
            <span>고객명</span>
            <input value={form.customer_name} onChange={(event) => updateForm("customer_name", event.target.value)} placeholder="예: 김고객" />
          </label>
          <label className="field">
            <span>정산명</span>
            <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="예: 역삼 사무실 임대 계약" />
          </label>
          <div className="field-grid two">
            <label className="field">
              <span>수수료 정산금</span>
              <input type="number" min="0" step="10000" value={form.commission_amount} onChange={(event) => updateForm("commission_amount", event.target.value)} />
            </label>
            <label className="field">
              <span>예상금액</span>
              <input type="number" min="0" step="10000" value={form.expected_amount} onChange={(event) => updateForm("expected_amount", event.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>상태</span>
            <select value={form.status} onChange={(event) => updateForm("status", event.target.value)}>
              <option value="예상">예상</option>
              <option value="정산완료">정산완료</option>
            </select>
          </label>
          <label className="field">
            <span>메모</span>
            <textarea rows="3" value={form.memo} onChange={(event) => updateForm("memo", event.target.value)} placeholder="입금 예정일, 분배 메모 등" />
          </label>

          {message ? <div className="schedule-inline-alert">{message}</div> : null}

          <div className="form-actions inline-actions">
            <button type="submit" className="primary-btn">
              {form.id ? "수정 저장" : "정산 저장"}
            </button>
            {form.id ? (
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

function StatCard({ label, value, tone }) {
  return (
    <article className={`settlement-stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export default SettlementPage;
