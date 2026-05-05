import { useEffect, useMemo, useState } from "react";
import { deleteSchedule, listCustomers, listSchedules, saveCustomer, saveSchedule } from "../services/supabaseRepository";

const SCHEDULE_TYPES = ["일정", "고객인입", "미팅", "계약금입금", "계약서작성", "잔금날", "기타"];
const CUSTOMER_PICKER_TYPES = new Set(["고객인입", "미팅", "계약금입금", "계약서작성", "잔금날"]);
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const HOLIDAY_MAP = {
  "01-01": "신정",
  "03-01": "삼일절",
  "05-05": "어린이날",
  "06-06": "현충일",
  "08-15": "광복절",
  "10-03": "개천절",
  "10-09": "한글날",
  "12-25": "성탄절",
};

const today = new Date();
const todayString = toDateInputValue(today);

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonthInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseDateString(dateString) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDateLabel(dateString) {
  if (!dateString) return "";
  const [year, month, day] = dateString.split("-");
  return `${Number(year)}년 ${Number(month)}월 ${Number(day)}일`;
}

function formatMonthLabel(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function buildCalendarCells(currentMonth) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const start = new Date(year, month, 1);
  start.setDate(start.getDate() - start.getDay());

  const end = new Date(year, month + 1, 0);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const cells = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const dateString = toDateInputValue(cursor);
    cells.push({
      key: dateString,
      dateString,
      day: cursor.getDate(),
      dayOfWeek: cursor.getDay(),
      isCurrentMonth: cursor.getMonth() === month,
      holiday: HOLIDAY_MAP[dateString.slice(5)],
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

function emptyForm(date = todayString) {
  return {
    id: undefined,
    title: "",
    customer_id: "",
    customer_name: "",
    schedule_date: date,
    schedule_time: "12:00",
    schedule_type: "일정",
    note: "",
  };
}

function getTypeClass(type) {
  if (type === "고객인입") return "inflow";
  if (type === "미팅") return "meeting";
  if (type === "계약금입금") return "deposit";
  if (type === "계약서작성") return "contract";
  if (type === "잔금날") return "balance";
  if (type === "기타") return "etc";
  return "default";
}

function isSameMonth(dateString, monthDate) {
  const date = parseDateString(dateString);
  return date.getFullYear() === monthDate.getFullYear() && date.getMonth() === monthDate.getMonth();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function extractPhone(value) {
  const match = String(value || "").match(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/);
  return match ? match[0].replace(/[.\s]/g, "-") : "";
}

function buildCustomerNameFromSchedule(schedule, customerSearch) {
  const rawName =
    normalizeText(schedule.customer_name) ||
    normalizeText(customerSearch) ||
    normalizeText(schedule.title).replace(/고객인입|일정/g, "").trim();
  return rawName || "이름 미입력 고객";
}

function SchedulesPage() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(todayString);
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(() => emptyForm(todayString));
  const [customerSearch, setCustomerSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      const [scheduleRows, customerRows] = await Promise.all([listSchedules(), listCustomers()]);
      setItems(Array.isArray(scheduleRows) ? scheduleRows : []);
      setCustomers(Array.isArray(customerRows) ? customerRows : []);
    } catch (error) {
      setMessage(error.message || "일정 정보를 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const calendarCells = useMemo(() => buildCalendarCells(currentMonth), [currentMonth]);

  const schedulesByDate = useMemo(() => {
    return items.reduce((acc, item) => {
      const key = item.schedule_date;
      if (!key) return acc;
      acc[key] = acc[key] || [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [items]);

  const selectedItems = schedulesByDate[selectedDate] || [];
  const monthItems = useMemo(
    () => items.filter((item) => item.schedule_date && isSameMonth(item.schedule_date, currentMonth)),
    [currentMonth, items],
  );
  const contractAndBalanceItems = monthItems.filter((item) => ["계약서작성", "잔금날"].includes(item.schedule_type));
  const monthlyFlowStats = [
    { label: "고객인입", type: "고객인입" },
    { label: "미팅", type: "미팅" },
    { label: "계약서", type: "계약서작성" },
    { label: "잔금", type: "잔금날" },
  ].map((stat) => ({
    ...stat,
    count: monthItems.filter((item) => item.schedule_type === stat.type).length,
    className: getTypeClass(stat.type),
  }));

  const filteredCustomers = useMemo(() => {
    const keyword = customerSearch.trim().toLowerCase();
    return customers
      .filter((customer) => {
        if (!keyword) return true;
        return [customer.name, customer.phone, customer.preferred_area, customer.property_type, customer.wanted_condition]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .slice(0, 8);
  }, [customerSearch, customers]);

  const openDateModal = (dateString) => {
    setSelectedDate(dateString);
    setForm(emptyForm(dateString));
    setCustomerSearch("");
    setIsModalOpen(true);
  };

  const editSchedule = (item) => {
    setForm({ ...emptyForm(item.schedule_date || selectedDate), ...item });
    setCustomerSearch(item.customer_name || "");
  };

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const pickCustomer = (customer) => {
    setForm((prev) => ({
      ...prev,
      customer_id: customer.id,
      customer_name: customer.name || "",
      title: prev.title || `${customer.name || "고객"} ${prev.schedule_type}`,
      note:
        prev.note ||
        [customer.phone, customer.preferred_area, customer.property_type, customer.wanted_condition].filter(Boolean).join("\n"),
    }));
    setCustomerSearch(customer.name || "");
  };

  const syncCustomerFromInflowSchedule = async (scheduleDraft) => {
    if (scheduleDraft.schedule_type !== "고객인입") return null;

    const name = buildCustomerNameFromSchedule(scheduleDraft, customerSearch);
    const phone = extractPhone(`${scheduleDraft.note || ""}\n${customerSearch}`);
    const existingCustomer =
      customers.find((customer) => scheduleDraft.customer_id && customer.id === scheduleDraft.customer_id) ||
      customers.find((customer) => phone && normalizeText(customer.phone) === phone) ||
      customers.find((customer) => normalizeText(customer.name) === name);

    return saveCustomer({
      ...(existingCustomer || {}),
      id: existingCustomer?.id || scheduleDraft.customer_id || undefined,
      name,
      phone: phone || existingCustomer?.phone || "",
      preferred_area: existingCustomer?.preferred_area || "",
      property_type: existingCustomer?.property_type || "사무실",
      wanted_condition: existingCustomer?.wanted_condition || existingCustomer?.requirement || scheduleDraft.note || "",
      contract_status: existingCustomer?.contract_status || "미계약",
      priority: existingCustomer?.priority || "보통",
      source: existingCustomer?.source || "일정관리",
      inflow_date: scheduleDraft.schedule_date || existingCustomer?.inflow_date || existingCustomer?.inquiry_date || "",
      memo: scheduleDraft.note || existingCustomer?.memo || existingCustomer?.notes || "",
    });
  };

  const handleMonthChange = (value) => {
    const [year, month] = value.split("-").map(Number);
    if (!year || !month) return;
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const moveMonth = (delta) => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const moveToday = () => {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(todayString);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const safeTitle = form.title.trim() || `${form.customer_name || form.schedule_type || "일정"} 일정`;
    let scheduleDraft = { ...form, title: safeTitle };

    try {
      setSaving(true);
      const linkedCustomer = await syncCustomerFromInflowSchedule(scheduleDraft);
      if (linkedCustomer?.id) {
        scheduleDraft = {
          ...scheduleDraft,
          customer_id: linkedCustomer.id,
          customer_name: linkedCustomer.name || scheduleDraft.customer_name,
          title: scheduleDraft.title || `${linkedCustomer.name || "고객"} 고객인입`,
        };
      }
      await saveSchedule(scheduleDraft);
      await refresh();
      setForm(emptyForm(selectedDate));
      setCustomerSearch("");
      setMessage(scheduleDraft.schedule_type === "고객인입" ? "일정과 고객 정보를 함께 저장했습니다." : "일정을 저장했습니다.");
    } catch (error) {
      setMessage(error.message || "일정 저장에 실패했습니다. 날짜, 시간, 종류를 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("일정을 삭제할까요?")) return;
    try {
      await deleteSchedule(id);
      await refresh();
      setForm(emptyForm(selectedDate));
    } catch (error) {
      setMessage(error.message || "일정 삭제에 실패했습니다.");
    }
  };

  const renderScheduleMini = (item) => (
    <span key={item.id} className={`schedule-type-badge type-${getTypeClass(item.schedule_type)}`}>
      {item.schedule_type}
    </span>
  );

  return (
    <div className="page-stack schedule-page-compact">
      <section className="page-header-card compact-page-header schedule-compact-header schedule-header-with-stats">
        <div>
          <span className="page-eyebrow">일정관리</span>
          <h1>월간 일정</h1>
          <p>날짜를 누르면 팝업에서 일정 확인, 등록, 수정까지 한 번에 처리합니다.</p>
        </div>
        <div className="monthly-flow-summary" aria-label="월간 일정 요약">
          {monthlyFlowStats.map((stat) => (
            <span key={stat.type} className={`flow-summary-chip ${stat.className}`}>
              {stat.label} <strong>{stat.count}</strong>
            </span>
          ))}
        </div>
      </section>

      <section className="schedule-calendar-panel schedule-main-panel">
        <div className="schedule-toolbar">
          <div>
            <h2>{formatMonthLabel(currentMonth)}</h2>
            <p>계약서작성과 잔금날은 아래 묶음에서 따로 확인할 수 있습니다.</p>
          </div>
          <div className="calendar-nav">
            <button type="button" className="secondary-btn small-btn" onClick={() => moveMonth(-1)}>
              이전
            </button>
            <input
              className="month-input"
              type="month"
              value={toMonthInputValue(currentMonth)}
              onChange={(event) => handleMonthChange(event.target.value)}
            />
            <button type="button" className="secondary-btn small-btn" onClick={() => moveMonth(1)}>
              다음
            </button>
            <button type="button" className="primary-btn small-btn" onClick={moveToday}>
              오늘
            </button>
          </div>
        </div>

        <div className="calendar-frame">
          <div className="calendar-weekdays">
            {WEEKDAY_LABELS.map((label, index) => (
              <span key={label} className={index === 0 || index === 6 ? "is-red-day" : ""}>
                {label}
              </span>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarCells.map((cell) => {
              const dayItems = schedulesByDate[cell.dateString] || [];
              const isSelected = cell.dateString === selectedDate;
              const isToday = cell.dateString === todayString;
              const isRedDay = cell.dayOfWeek === 0 || cell.dayOfWeek === 6 || cell.holiday;
              return (
                <button
                  key={cell.key}
                  type="button"
                  className={[
                    "calendar-cell",
                    !cell.isCurrentMonth ? "is-muted" : "",
                    isSelected ? "is-selected" : "",
                    isToday ? "is-today" : "",
                    isRedDay ? "is-red-day" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => openDateModal(cell.dateString)}
                >
                  <span className="calendar-cell-top">
                    <strong>{cell.day}</strong>
                    {cell.holiday ? <em>{cell.holiday}</em> : null}
                  </span>
                  <span className="calendar-cell-body">
                    {dayItems.slice(0, 3).map(renderScheduleMini)}
                    {dayItems.length > 3 ? <span className="calendar-more">+{dayItems.length - 3}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="schedule-lists-grid">
        <ScheduleListCard title="이번 달 일정내역" items={monthItems} onEdit={openDateModal} />
        <ScheduleListCard title="계약서작성 · 잔금날 일정" items={contractAndBalanceItems} onEdit={openDateModal} highlight />
      </section>

      {message ? <div className="schedule-inline-alert">{message}</div> : null}

      {isModalOpen ? (
        <div className="schedule-modal-backdrop" role="presentation" onMouseDown={() => setIsModalOpen(false)}>
          <div className="schedule-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="schedule-modal-head">
              <div>
                <span className="page-eyebrow">선택 날짜</span>
                <h2>{formatDateLabel(selectedDate)}</h2>
              </div>
              <button type="button" className="secondary-btn small-btn" onClick={() => setIsModalOpen(false)}>
                닫기
              </button>
            </div>

            <div className="schedule-modal-grid">
              <div className="schedule-day-list">
                <h3>등록된 일정</h3>
                {selectedItems.length ? (
                  selectedItems.map((item) => (
                    <article key={item.id} className={`schedule-day-item ${getTypeClass(item.schedule_type)}`}>
                      <div>
                        <strong>{item.title}</strong>
                        <span>
                          {item.schedule_time || "시간 미정"} · {item.schedule_type}
                        </span>
                        {item.customer_name ? <small>{item.customer_name}</small> : null}
                        {item.note ? <p>{item.note}</p> : null}
                      </div>
                      <div className="inline-actions">
                        <button type="button" className="secondary-btn small-btn" onClick={() => editSchedule(item)}>
                          수정
                        </button>
                        <button type="button" className="danger-btn small-btn" onClick={() => handleDelete(item.id)}>
                          삭제
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty-state">이 날짜에 등록된 일정이 없습니다.</div>
                )}
              </div>

              <form className="schedule-edit-form" onSubmit={handleSubmit}>
                <h3>{form.id ? "일정 수정" : "새 일정 등록"}</h3>
                <div className="field-grid two">
                  <label className="field">
                    <span>일정명</span>
                    <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="예: 김고객 미팅" />
                  </label>
                  <label className="field">
                    <span>일정종류</span>
                    <select value={form.schedule_type} onChange={(event) => updateForm("schedule_type", event.target.value)}>
                      {SCHEDULE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="field-grid two">
                  <label className="field">
                    <span>날짜</span>
                    <input type="date" value={form.schedule_date} onChange={(event) => updateForm("schedule_date", event.target.value)} />
                  </label>
                  <label className="field">
                    <span>시간</span>
                    <input type="time" value={form.schedule_time || ""} onChange={(event) => updateForm("schedule_time", event.target.value)} />
                  </label>
                </div>

                {CUSTOMER_PICKER_TYPES.has(form.schedule_type) ? (
                  <div className="customer-picker">
                    <label className="field">
                      <span>고객 선택</span>
                      <input
                        value={customerSearch}
                        onChange={(event) => setCustomerSearch(event.target.value)}
                        placeholder="고객명 또는 연락처 검색"
                      />
                    </label>
                    <div className="customer-picker-list">
                      {filteredCustomers.length ? (
                        filteredCustomers.map((customer) => (
                          <button key={customer.id} type="button" className="customer-picker-item" onClick={() => pickCustomer(customer)}>
                            <strong>{customer.name || "이름 없음"}</strong>
                            <span>{customer.phone || "연락처 미입력"}</span>
                          </button>
                        ))
                      ) : (
                        <span className="customer-picker-empty">선택할 고객이 없습니다.</span>
                      )}
                    </div>
                  </div>
                ) : null}

                <label className="field">
                  <span>메모</span>
                  <textarea rows="4" value={form.note || ""} onChange={(event) => updateForm("note", event.target.value)} />
                </label>

                <div className="form-actions inline-actions">
                  <button type="submit" className="primary-btn" disabled={saving}>
                    {saving ? "저장 중..." : form.id ? "수정 저장" : "일정 저장"}
                  </button>
                  {form.id ? (
                    <button type="button" className="secondary-btn" onClick={() => setForm(emptyForm(selectedDate))}>
                      새 일정
                    </button>
                  ) : null}
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScheduleListCard({ title, items, onEdit, highlight = false }) {
  return (
    <div className={`schedule-table-panel ${highlight ? "is-highlight" : ""}`}>
      <div className="section-heading-row">
        <div>
          <h2>{title}</h2>
          <p>{items.length}건</p>
        </div>
      </div>
      <div className="deal-schedule-list">
        {items.length ? (
          items.map((item) => (
            <button key={item.id} type="button" className={`deal-schedule-item ${getTypeClass(item.schedule_type)}`} onClick={() => onEdit(item.schedule_date)}>
              <span>{item.schedule_date}</span>
              <strong>{item.title}</strong>
              <em>{item.schedule_type}</em>
              {item.note ? <small>{item.note}</small> : null}
            </button>
          ))
        ) : (
          <div className="empty-state">표시할 일정이 없습니다.</div>
        )}
      </div>
    </div>
  );
}

export default SchedulesPage;
