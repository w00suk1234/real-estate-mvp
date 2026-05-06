import { useEffect, useMemo, useState } from "react";
import { deleteSchedule, listCustomers, listSchedules, saveCustomer, saveSchedule, saveSettlement } from "../services/supabaseRepository";

const SCHEDULE_TYPES = ["일정", "고객인입", "미팅", "계약금입금", "계약서일정", "잔금날", "기타"];
const CUSTOMER_PICKER_TYPES = new Set(["미팅", "계약금입금", "계약서일정", "잔금날"]);
const IMPORTANT_TYPES = new Set(["계약서일정", "잔금날"]);
const DEFAULT_FORM = {
  id: "",
  title: "",
  schedule_date: "",
  schedule_time: "",
  schedule_type: "일정",
  note: "",
  customer_id: "",
  customer_name: "",
};

const HOLIDAYS = {
  "2026-01-01": "신정",
  "2026-02-16": "설연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설연휴",
  "2026-03-01": "삼일절",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날",
  "2026-06-06": "현충일",
  "2026-08-15": "광복절",
  "2026-09-24": "추석연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석연휴",
  "2026-10-03": "개천절",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절",
};

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function formatMonth(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}

function getMonthCells(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      key: formatDate(date),
      currentMonth: date.getMonth() === month,
      day: date.getDay(),
    };
  });
}

function getTypeClass(type) {
  if (type === "고객인입") return "inflow";
  if (type === "미팅") return "meeting";
  if (type === "계약금입금") return "deposit";
  if (type === "계약서일정") return "contract";
  if (type === "잔금날") return "balance";
  if (type === "기타") return "etc";
  return "default";
}

function getScheduleTitle(item) {
  return item.title || item.customer_name || item.schedule_type || "일정";
}

function toSchedulePayload(form) {
  const payload = {
    title: form.title.trim(),
    schedule_date: form.schedule_date,
    schedule_time: form.schedule_time,
    schedule_type: form.schedule_type,
    note: form.note.trim(),
    customer_id: form.customer_id || null,
    customer_name: form.customer_name || "",
  };
  if (form.id) payload.id = form.id;
  if (!CUSTOMER_PICKER_TYPES.has(form.schedule_type)) {
    payload.customer_id = null;
    payload.customer_name = "";
  }
  return payload;
}

function SchedulesPage() {
  const today = useMemo(() => new Date(), []);
  const [monthDate, setMonthDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(formatDate(today));
  const [schedules, setSchedules] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ ...DEFAULT_FORM, schedule_date: formatDate(today) });
  const [customerSearch, setCustomerSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const cells = useMemo(() => getMonthCells(monthDate), [monthDate]);
  const scheduleMap = useMemo(() => {
    return schedules.reduce((acc, item) => {
      const key = item.schedule_date;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [schedules]);

  const monthSchedules = useMemo(() => {
    const monthKey = formatMonth(monthDate);
    return schedules
      .filter((item) => (item.schedule_date || "").startsWith(monthKey))
      .sort((a, b) => String(a.schedule_date).localeCompare(String(b.schedule_date)) || String(a.schedule_time || "").localeCompare(String(b.schedule_time || "")));
  }, [monthDate, schedules]);

  const selectedSchedules = scheduleMap[selectedDate] || [];
  const dealSchedules = monthSchedules.filter((item) => IMPORTANT_TYPES.has(item.schedule_type));
  const filteredCustomers = customers
    .filter((customer) => {
      const keyword = customerSearch.trim().toLowerCase();
      if (!keyword) return true;
      return [customer.name, customer.phone, customer.preferred_area].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword));
    })
    .slice(0, 8);

  const loadData = async () => {
    const [scheduleRows, customerRows] = await Promise.all([listSchedules(), listCustomers()]);
    setSchedules(scheduleRows);
    setCustomers(customerRows);
  };

  useEffect(() => {
    loadData().catch((error) => setMessage(error.message));
  }, []);

  const openDateModal = (dateKey) => {
    setSelectedDate(dateKey);
    setForm({ ...DEFAULT_FORM, schedule_date: dateKey });
    setCustomerSearch("");
    setModalOpen(true);
  };

  const editSchedule = (item) => {
    setSelectedDate(item.schedule_date);
    setForm({
      id: item.id || "",
      title: item.title || "",
      schedule_date: item.schedule_date || selectedDate,
      schedule_time: item.schedule_time || "",
      schedule_type: item.schedule_type || "일정",
      note: item.note || "",
      customer_id: item.customer_id || "",
      customer_name: item.customer_name || "",
    });
    setCustomerSearch(item.customer_name || "");
    setModalOpen(true);
  };

  const resetForm = (dateKey = selectedDate) => {
    setForm({ ...DEFAULT_FORM, schedule_date: dateKey });
    setCustomerSearch("");
  };

  const handleTypeChange = (value) => {
    setForm((prev) => ({
      ...prev,
      schedule_type: value,
      customer_id: CUSTOMER_PICKER_TYPES.has(value) ? prev.customer_id : "",
      customer_name: CUSTOMER_PICKER_TYPES.has(value) ? prev.customer_name : "",
    }));
    if (!CUSTOMER_PICKER_TYPES.has(value)) setCustomerSearch("");
  };

  const selectCustomer = (customer) => {
    setForm((prev) => ({
      ...prev,
      customer_id: customer.id,
      customer_name: customer.name || "",
      title: prev.title || ((customer.name || "고객") + " " + prev.schedule_type),
    }));
    setCustomerSearch(customer.name || "");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setMessage("일정명을 입력해 주세요.");
      return;
    }
    if (!form.schedule_date) {
      setMessage("일정 날짜를 선택해 주세요.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const isNew = !form.id;
      const payload = toSchedulePayload(form);
      const saved = await saveSchedule(payload);

      if (isNew && payload.schedule_type === "고객인입") {
        await saveCustomer({
          name: payload.title || "고객인입",
          phone: "",
          preferred_area: "",
          property_type: "사무실",
          wanted_condition: "",
          inflow_date: payload.schedule_date,
          contract_status: "미계약",
          priority: "보통",
          meeting_status: "미팅 전",
          source: "고객인입 일정",
          memo: payload.note || "",
        });
      }

      if (payload.schedule_type === "잔금날" && payload.customer_id) {
        await saveSettlement({
          source_schedule_id: saved.id,
          customer_id: payload.customer_id,
          customer_name: payload.customer_name || payload.title,
          settlement_date: payload.schedule_date,
          status: "정산대기",
          memo: "잔금날 일정: " + payload.title,
        });
      }

      await loadData();
      resetForm(payload.schedule_date);
      setMessage("일정이 저장되었습니다.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!id) return;
    const confirmed = window.confirm("이 일정을 삭제할까요?");
    if (!confirmed) return;
    await deleteSchedule(id);
    await loadData();
    resetForm();
  };

  const changeMonth = (offset) => {
    setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const moveToday = () => {
    const now = new Date();
    setMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(formatDate(now));
  };

  return (
    <div className="page-content page-content-wide">
      <div className="page-header compact-page-header">
        <div>
          <span className="eyebrow">업무 일정</span>
          <h1>일정관리</h1>
          <p>달력에서 날짜를 눌러 일정을 등록하고 계약서·잔금 일정을 함께 확인합니다.</p>
        </div>
      </div>

      <section className="schedule-hero compact-schedule-hero">
        <div className="schedule-toolbar">
          <button type="button" className="secondary-button" onClick={() => changeMonth(-1)}>이전달</button>
          <input
            type="month"
            value={formatMonth(monthDate)}
            onChange={(event) => {
              const [year, month] = event.target.value.split("-").map(Number);
              setMonthDate(new Date(year, month - 1, 1));
            }}
          />
          <button type="button" className="secondary-button" onClick={() => changeMonth(1)}>다음달</button>
          <button type="button" className="primary-button" onClick={moveToday}>오늘</button>
        </div>
        <button type="button" className="primary-button" onClick={() => openDateModal(selectedDate)}>새 일정 등록</button>
      </section>

      <section className="schedule-calendar-panel">
        <div className="calendar-frame">
          <div className="calendar-weekdays">
            {["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="calendar-grid">
            {cells.map((cell) => {
              const daySchedules = scheduleMap[cell.key] || [];
              const isToday = cell.key === formatDate(today);
              const isSelected = cell.key === selectedDate;
              const isHoliday = Boolean(HOLIDAYS[cell.key]);
              const className = [
                "calendar-cell",
                !cell.currentMonth ? "is-muted" : "",
                cell.day === 0 || cell.day === 6 || isHoliday ? "is-red-day" : "",
                isToday ? "is-today" : "",
                isSelected ? "is-selected" : "",
              ].filter(Boolean).join(" ");
              return (
                <button type="button" key={cell.key} className={className} onClick={() => openDateModal(cell.key)}>
                  <span className="calendar-date-row">
                    <span>{cell.date.getDate()}</span>
                    {HOLIDAYS[cell.key] ? <small>{HOLIDAYS[cell.key]}</small> : null}
                  </span>
                  <span className="calendar-schedule-stack">
                    {daySchedules.slice(0, 3).map((item) => (
                      <span key={item.id} className={"schedule-type-badge " + getTypeClass(item.schedule_type)} onClick={(event) => { event.stopPropagation(); editSchedule(item); }}>
                        {getScheduleTitle(item)}
                      </span>
                    ))}
                    {daySchedules.length > 3 ? <span className="schedule-more">+{daySchedules.length - 3}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="schedule-lists-grid">
        <div className="schedule-table-panel">
          <h2>이번달 일정내역</h2>
          {monthSchedules.length ? (
            <div className="schedule-day-list">
              {monthSchedules.map((item) => (
                <button type="button" key={item.id} className="schedule-day-item" onClick={() => editSchedule(item)}>
                  <span>{item.schedule_date} {item.schedule_time || ""}</span>
                  <strong>{getScheduleTitle(item)}</strong>
                  <em className={"schedule-type-badge " + getTypeClass(item.schedule_type)}>{item.schedule_type}</em>
                </button>
              ))}
            </div>
          ) : <div className="empty-state">이번 달 일정이 없습니다.</div>}
        </div>

        <div className="schedule-table-panel">
          <h2>계약서·잔금 일정</h2>
          {dealSchedules.length ? (
            <div className="deal-schedule-list">
              {dealSchedules.map((item) => (
                <button type="button" key={item.id} className="deal-schedule-item" onClick={() => editSchedule(item)}>
                  <span className={"schedule-type-badge " + getTypeClass(item.schedule_type)}>{item.schedule_type}</span>
                  <strong>{getScheduleTitle(item)}</strong>
                  <small>{item.schedule_date} {item.schedule_time || ""}</small>
                </button>
              ))}
            </div>
          ) : <div className="empty-state">계약서 작성 또는 잔금날 일정이 없습니다.</div>}
        </div>
      </section>

      {modalOpen ? (
        <div className="schedule-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
          <div className="schedule-modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">선택 날짜</span>
                <h2>{selectedDate}</h2>
              </div>
              <button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>닫기</button>
            </div>

            <div className="schedule-modal-grid">
              <div>
                <h3>등록된 일정</h3>
                {selectedSchedules.length ? (
                  <div className="schedule-day-list">
                    {selectedSchedules.map((item) => (
                      <button type="button" key={item.id} className="schedule-day-item" onClick={() => editSchedule(item)}>
                        <span>{item.schedule_time || "시간 미정"}</span>
                        <strong>{getScheduleTitle(item)}</strong>
                        <em className={"schedule-type-badge " + getTypeClass(item.schedule_type)}>{item.schedule_type}</em>
                      </button>
                    ))}
                  </div>
                ) : <div className="empty-state">이 날짜에 등록된 일정이 없습니다.</div>}
              </div>

              <form className="schedule-edit-form" onSubmit={handleSubmit}>
                <h3>{form.id ? "일정 수정" : "새 일정 등록"}</h3>
                <label>
                  일정명
                  <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="예: 김은수 고객 잔금" />
                </label>
                <div className="compact-select-grid">
                  <label>
                    날짜
                    <input type="date" value={form.schedule_date} onChange={(event) => setForm((prev) => ({ ...prev, schedule_date: event.target.value }))} />
                  </label>
                  <label>
                    시간
                    <input type="time" value={form.schedule_time || ""} onChange={(event) => setForm((prev) => ({ ...prev, schedule_time: event.target.value }))} />
                  </label>
                </div>
                <label>
                  일정종류
                  <select value={form.schedule_type} onChange={(event) => handleTypeChange(event.target.value)}>
                    {SCHEDULE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>

                {CUSTOMER_PICKER_TYPES.has(form.schedule_type) ? (
                  <div className="customer-picker-box">
                    <label>
                      고객 선택
                      <input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="고객명 또는 연락처 검색" />
                    </label>
                    <div className="customer-picker-list">
                      {filteredCustomers.map((customer) => (
                        <button type="button" key={customer.id} onClick={() => selectCustomer(customer)}>
                          <strong>{customer.name || "이름 없음"}</strong>
                          <span>{customer.phone || "연락처 없음"}</span>
                        </button>
                      ))}
                    </div>
                    {form.customer_name ? <p className="selected-customer">선택 고객: {form.customer_name}</p> : null}
                  </div>
                ) : null}

                <label>
                  메모
                  <textarea value={form.note} onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))} placeholder="일정 메모를 입력하세요." />
                </label>

                {message ? <p className="form-message">{message}</p> : null}

                <div className="inline-actions">
                  <button type="submit" className="primary-button" disabled={saving}>{saving ? "저장 중" : "저장"}</button>
                  <button type="button" className="secondary-button" onClick={() => resetForm(form.schedule_date)}>새로 입력</button>
                  {form.id ? <button type="button" className="danger-button" onClick={() => handleDelete(form.id)}>삭제</button> : null}
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SchedulesPage;
