import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { deleteSchedule, listCustomers, listSchedules, saveCustomer, saveSchedule, upsertSettlementFromSchedule } from "../services/supabaseRepository";

const SCHEDULE_TYPES = ["일정", "고객인입", "미팅", "계약금입금", "계약서일정", "잔금일", "기타"];
const CUSTOMER_PICKER_TYPES = new Set(["미팅", "계약금입금", "계약서일정", "잔금일"]);
const BALANCE_TYPES = new Set(["잔금일", "잔금", "잔금날"]);
const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const today = new Date();
const FIXED_HOLIDAYS = {
  "01-01": "신정",
  "03-01": "삼일절",
  "05-05": "어린이날",
  "06-06": "현충일",
  "08-15": "광복절",
  "10-03": "개천절",
  "10-09": "한글날",
  "12-25": "성탄절",
};
const SPECIAL_HOLIDAYS = {
  "2026-02-16": "설날",
  "2026-02-17": "설날",
  "2026-02-18": "설날",
  "2026-03-02": "대체공휴일",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "대체공휴일",
  "2026-09-24": "추석",
  "2026-09-25": "추석",
  "2026-09-26": "추석",
};

function toDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function toMonthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function parseDate(value) {
  const [y, m, d] = String(value || toDateValue(today)).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function getHolidayName(dateString) {
  return SPECIAL_HOLIDAYS[dateString] || FIXED_HOLIDAYS[dateString.slice(5)] || "";
}
function formatDate(value) {
  if (!value) return "날짜 없음";
  const [y, m, d] = value.split("-");
  return `${Number(y)}년 ${Number(m)}월 ${Number(d)}일`;
}
function formatScheduleDate(value) {
  if (!value) return { date: "날짜 없음", day: "" };
  const [y, m, d] = String(value).split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return {
    date: `${Number(m)}.${Number(d)}`,
    day: WEEKDAYS[(date.getDay() + 6) % 7],
  };
}
function sortSchedules(a, b) {
  const dateCompare = String(a.schedule_date || "").localeCompare(String(b.schedule_date || ""));
  if (dateCompare !== 0) return dateCompare;
  return String(a.schedule_time || "").localeCompare(String(b.schedule_time || ""));
}
function getScheduleCustomerName(item) {
  const title = normalize(item.title);
  const type = normalizeScheduleType(normalize(item.schedule_type));
  const customer = normalize(item.customer_name);
  if (customer) return customer;
  if (title && type && title.endsWith(type)) return normalize(title.slice(0, -type.length));
  if (BALANCE_TYPES.has(item.schedule_type) && /(?:잔금날|잔금)$/.test(title)) return normalize(title.replace(/(?:잔금날|잔금)$/, ""));
  return title || "고객 없음";
}
function getScheduleDisplayTitle(item) {
  const title = item.title || "일정";
  if (BALANCE_TYPES.has(item.schedule_type)) {
    return title.replace(/(?:잔금날|잔금)$/, "잔금일");
  }
  return title;
}
function groupSchedulesByDate(items) {
  return [...items].sort(sortSchedules).reduce((groups, item) => {
    const date = item.schedule_date || "no-date";
    const last = groups[groups.length - 1];
    if (last?.date === date) {
      last.items.push(item);
    } else {
      groups.push({ date, items: [item] });
    }
    return groups;
  }, []);
}
function buildCells(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  first.setDate(first.getDate() - mondayOffset);
  const last = new Date(year, month + 1, 0);
  const sundayOffset = (7 - last.getDay()) % 7;
  last.setDate(last.getDate() + sundayOffset);
  const cells = [];
  for (let date = new Date(first); date <= last; date.setDate(date.getDate() + 1)) {
    const current = new Date(date);
    const dateString = toDateValue(current);
    const holidayName = getHolidayName(dateString);
    cells.push({
      date: current,
      dateString,
      day: current.getDate(),
      dayOfWeek: current.getDay(),
      isCurrentMonth: current.getMonth() === month,
      isToday: dateString === toDateValue(today),
      isWeekend: current.getDay() === 0 || current.getDay() === 6,
      isHoliday: Boolean(holidayName),
      holidayName,
    });
  }
  return cells;
}
function emptyForm(date = toDateValue(today)) {
  return {
    id: undefined,
    title: "",
    customer_id: "",
    linked_customer_id: "",
    customer_name: "",
    schedule_date: date,
    schedule_time: "10:00",
    schedule_type: "일정",
    note: "",
  };
}
function normalizeScheduleType(type) {
  return type === "잔금" || type === "잔금날" ? "잔금일" : type;
}
function typeClass(type) {
  const normalizedType = normalizeScheduleType(type);
  if (normalizedType === "고객인입") return "inflow";
  if (normalizedType === "미팅") return "meeting";
  if (normalizedType === "계약금입금") return "deposit";
  if (normalizedType === "계약서일정") return "contract";
  if (normalizedType === "잔금일") return "balance";
  if (normalizedType === "기타") return "etc";
  return "default";
}
function normalize(value) {
  return String(value || "").trim();
}
function extractPhone(value) {
  const found = String(value || "").match(/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/);
  return found ? found[0].replace(/[.\s]/g, "-") : "";
}
function mergeMemoOnce(existing, next) {
  const prev = normalize(existing);
  const add = normalize(next);
  if (!add) return prev;
  if (!prev) return add;
  return prev.includes(add) ? prev : `${prev}\n${add}`;
}
function customerLabel(customer) {
  return [customer.name, customer.phone, customer.property_type].filter(Boolean).join(" · ");
}

export default function SchedulesPage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(toDateValue(today));
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(() => emptyForm(toDateValue(today)));
  const [modalOpen, setModalOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [scheduleRows, customerRows] = await Promise.all([listSchedules(), listCustomers()]);
    setItems(Array.isArray(scheduleRows) ? scheduleRows : []);
    setCustomers(Array.isArray(customerRows) ? customerRows : []);
  }

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setItems([]);
      setCustomers([]);
      setModalOpen(false);
      setMessage("");
      return;
    }

    load().catch((error) => setMessage(error.message || "일정 데이터를 불러오지 못했습니다."));
  }, [authLoading, isAuthenticated, user?.id]);

  const cells = useMemo(() => buildCells(month), [month]);
  const displayItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const schedulesByDate = useMemo(() => {
    return displayItems.reduce((map, item) => {
      const date = item.schedule_date;
      if (!date) return map;
      map[date] = [...(map[date] || []), item];
      return map;
    }, {});
  }, [displayItems]);
  const selectedSchedules = schedulesByDate[selectedDate] || [];
  const filteredCustomers = useMemo(() => {
    const keyword = customerSearch.trim().toLowerCase();
    if (!keyword) return [];
    return customers
      .filter((customer) => customerLabel(customer).toLowerCase().includes(keyword))
      .slice(0, 10);
  }, [customerSearch, customers]);
  const selectedCustomer = useMemo(() => {
    const selectedId = form.linked_customer_id || form.customer_id;
    return customers.find((customer) => String(customer.id) === String(selectedId)) || null;
  }, [customers, form.customer_id, form.linked_customer_id]);
  const monthSchedules = useMemo(() => {
    const key = toMonthValue(month);
    return displayItems
      .filter((item) => String(item.schedule_date || "").startsWith(key))
      .sort(sortSchedules);
  }, [displayItems, month]);
  function openCreate(date) {
    setSelectedDate(date);
    setForm(emptyForm(date));
    setCustomerSearch("");
    setModalOpen(true);
  }
  function openEdit(item) {
    setSelectedDate(item.schedule_date || selectedDate);
    setForm({ ...emptyForm(item.schedule_date || selectedDate), ...item, schedule_type: normalizeScheduleType(item.schedule_type) });
    setCustomerSearch("");
    setModalOpen(true);
  }
  function updateForm(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "schedule_type" && value === "고객인입") {
        next.customer_id = "";
        next.linked_customer_id = "";
        next.customer_name = "";
        setCustomerSearch("");
      }
      if (key === "schedule_type" && !CUSTOMER_PICKER_TYPES.has(value)) {
        next.customer_id = "";
        next.linked_customer_id = "";
        next.customer_name = "";
        setCustomerSearch("");
      }
      return next;
    });
  }
  function selectCustomer(customer) {
    setForm((prev) => ({
      ...prev,
      customer_id: customer.id || "",
      linked_customer_id: customer.id || "",
      customer_name: customer.name || "",
      title: prev.title || `${customer.name || "고객"} ${prev.schedule_type}`,
    }));
    setCustomerSearch("");
  }

  async function syncInflowCustomer(savedSchedule, draft) {
    if (draft.schedule_type !== "고객인입") return;
    const titleName = normalize(draft.title).replace(/고객인입|일정/g, "").trim();
    const name = titleName || normalize(draft.customer_name) || "이름 미입력 고객";
    const phone = extractPhone(`${draft.note}\n${draft.title}`);
    const existing = customers.find((customer) => {
      const samePhone = phone && normalize(customer.phone) === phone;
      const sameName = normalize(customer.name) === name;
      return samePhone || sameName;
    });
    const payload = {
      ...(existing || {}),
      name,
      phone: phone || existing?.phone || "",
      property_type: existing?.property_type || "사무실",
      contract_status: existing?.contract_status || "미계약",
      priority: existing?.priority || "보통",
      source: "고객인입 일정",
      source_schedule_id: savedSchedule?.id || existing?.source_schedule_id || "",
      inflow_date: draft.schedule_date,
      memo: mergeMemoOnce(existing?.memo || existing?.notes, draft.note || draft.title),
    };
    await saveCustomer(payload);
  }

  async function syncSettlement(savedSchedule, draft) {
    if (!BALANCE_TYPES.has(draft.schedule_type)) return false;
    const customerId = draft.linked_customer_id || draft.customer_id;
    const customer = customers.find((item) => String(item.id) === String(customerId));
    if (!customer) return false;

    await upsertSettlementFromSchedule(
      {
        ...savedSchedule,
        schedule_type: draft.schedule_type,
        schedule_date: draft.schedule_date,
        schedule_time: draft.schedule_time,
        title: draft.title,
        note: draft.note,
        customer_id: customerId,
        customer_name: customer.name,
      },
      customer,
    );
    return true;
  }
  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    if (!normalize(form.title)) {
      setMessage("일정명을 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const draft = {
        ...form,
        customer_id: form.schedule_type === "고객인입" ? "" : form.customer_id,
        linked_customer_id: form.schedule_type === "고객인입" ? "" : form.linked_customer_id,
        customer_name: form.schedule_type === "고객인입" ? "" : form.customer_name,
      };
      const saved = await saveSchedule(draft);
      await syncInflowCustomer(saved, draft);
      const settlementLinked = await syncSettlement(saved, draft);
      await load();
      setModalOpen(false);
      setMessage(settlementLinked ? "잔금 일정과 정산 대기 항목을 함께 저장했습니다." : "일정을 저장했습니다.");
    } catch (error) {
      setMessage(error.message || "일정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!id) return;
    const confirmed = window.confirm("일정을 삭제하면 복구가 어렵습니다. 삭제하시겠습니까?");
    if (!confirmed) return;
    try {
      await deleteSchedule(id);
      await load();
      setModalOpen(false);
      setMessage("일정을 삭제했습니다.");
    } catch (error) {
      setMessage(error.message || "일정 삭제에 실패했습니다.");
    }
  }

  return (
    <div className="page-stack schedule-page-compact">
      <section className="page-header-card compact-page-header">
        <div>
          <h1>일정관리</h1>
          <p>월간 일정과 고객 흐름을 한 화면에서 관리합니다.</p>
        </div>
      </section>

      {message && <div className="notice-banner">{message}</div>}

      <section className="dashboard-card schedule-toolbar compact-schedule-toolbar">
        <div>
          <strong>{month.getFullYear()}년 {month.getMonth() + 1}월</strong>
          <p>날짜를 클릭하면 일정 등록/수정 창이 열립니다.</p>
        </div>
        <div className="toolbar-actions schedule-nav-actions">
          <input className="schedule-month-input-ui" type="month" value={toMonthValue(month)} onChange={(event) => setMonth(parseDate(`${event.target.value}-01`))} />
          <button type="button" className="button secondary schedule-nav-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>이전</button>
          <button type="button" className="button secondary schedule-nav-btn today-btn" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>오늘</button>
          <button type="button" className="button secondary schedule-nav-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>다음</button>
        </div>
      </section>

      <section className="dashboard-card calendar-card compact-calendar-card">
        <div className="calendar-weekdays">
          {WEEKDAYS.map((day) => (
              <span key={day} className={day === "토" || day === "일" ? "weekend" : ""}>
                {day}
              </span>
            ))}
        </div>
        <div className="calendar-grid">
          {cells.map((cell) => {
            const dayItems = schedulesByDate[cell.dateString] || [];
            return (
              <button
                type="button"
                key={cell.dateString}
                className={`calendar-cell ${cell.isCurrentMonth ? "" : "muted"} ${cell.isToday ? "today" : ""} ${cell.dateString === selectedDate ? "selected" : ""} ${cell.isWeekend ? "weekend" : ""} ${cell.isHoliday ? "holiday" : ""}`}
                onClick={() => openCreate(cell.dateString)}
              >
                <span className="calendar-date-line">
                  <span className="date-number">
                    {cell.isCurrentMonth ? cell.day : `${cell.date.getMonth() + 1}/${cell.day}`}
                  </span>
                  {cell.holidayName ? <span className="holiday-label">{cell.holidayName}</span> : null}
                </span>
                <div className="calendar-events">
                  {dayItems.slice(0, 3).map((item) => (
                    <span key={item.id || `${item.title}-${item.schedule_time}`} className={`event-pill ${typeClass(item.schedule_type)}`} onClick={(event) => { event.stopPropagation(); openEdit(item); }}>
                      {getScheduleDisplayTitle(item)}
                    </span>
                  ))}
                  {dayItems.length > 3 && <span className="event-more">+{dayItems.length - 3}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="schedule-summary-grid">
        <div className="dashboard-card">
          <h2>이번달 일정내역</h2>
          <ScheduleList items={monthSchedules} onEdit={openEdit} />
        </div>
      </section>

      {modalOpen && (
        <div className="modal-backdrop" onMouseDown={() => setModalOpen(false)}>
          <form className="schedule-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">{formatDate(form.schedule_date)}</span>
                <h2>{form.id ? "일정 수정" : "새 일정 등록"}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setModalOpen(false)}>×</button>
            </div>
            <label>일정명<input value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="예: 홍길동 잔금 확인" /></label>
            <div className="form-grid two">
              <label>날짜<input type="date" value={form.schedule_date} onChange={(event) => updateForm("schedule_date", event.target.value)} /></label>
              <label>시간<input type="time" value={form.schedule_time || ""} onChange={(event) => updateForm("schedule_time", event.target.value)} /></label>
            </div>
            <label>일정종류<select value={form.schedule_type} onChange={(event) => updateForm("schedule_type", event.target.value)}>{SCHEDULE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            {CUSTOMER_PICKER_TYPES.has(form.schedule_type) && (
              <div className="customer-picker-box">
                <label>고객 검색<input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder={form.customer_name ? "다른 고객으로 변경하려면 검색" : "고객명 또는 연락처 검색"} /></label>
                {(form.customer_name || selectedCustomer) && (
                  <div className="selected-customer-card">
                    <strong>{selectedCustomer?.name || form.customer_name}</strong>
                    <span>{[selectedCustomer?.phone, selectedCustomer?.property_type].filter(Boolean).join(" · ") || "연결된 고객"}</span>
                  </div>
                )}
                {customerSearch.trim() ? (
                  <div className="customer-picker-list">
                    {filteredCustomers.map((customer) => <button type="button" key={customer.id || customer.name} onClick={() => selectCustomer(customer)}>{customerLabel(customer)}</button>)}
                    {filteredCustomers.length === 0 && <p>검색된 고객이 없습니다.</p>}
                  </div>
                ) : null}
              </div>
            )}
            <label>메모<textarea rows="4" value={form.note || ""} onChange={(event) => updateForm("note", event.target.value)} placeholder="상담 내용, 잔금 확인사항 등을 입력하세요." /></label>
            <div className="modal-actions">
              {form.id && <button type="button" className="button danger" onClick={() => handleDelete(form.id)}>삭제</button>}
              <button type="button" className="button secondary" onClick={() => setModalOpen(false)}>취소</button>
              <button type="submit" className="button primary" disabled={saving}>{saving ? "저장 중" : "저장"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ScheduleList({ items, onEdit }) {
  if (!items.length) return <div className="empty-state">등록된 일정이 없습니다.</div>;
  return (
    <div className="schedule-list compact-list">
      {groupSchedulesByDate(items).map((group) => {
        const scheduleDate = formatScheduleDate(group.date);
        return (
          <section key={group.date} className="schedule-date-group">
            <div className="schedule-date-stamp">
              <strong>{scheduleDate.date}</strong>
              <span>{scheduleDate.day}</span>
            </div>
            <div className="schedule-group-items">
              {group.items.map((item) => {
                const customerName = getScheduleCustomerName(item);
                const scheduleClass = typeClass(item.schedule_type);
                return (
                  <button type="button" key={item.id || `${item.title}-${item.schedule_date}`} className={`schedule-row ${scheduleClass}`} onClick={() => onEdit(item)}>
                    <span className={`event-dot ${scheduleClass}`} />
                    <strong className="schedule-row-name">{customerName}</strong>
                    <span className={`schedule-type-badge ${scheduleClass}`}>{normalizeScheduleType(item.schedule_type) || "일정"}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
