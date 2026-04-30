import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

const scheduleTypes = ["일정", "고객인입", "미팅", "계약금입금", "계약서작성", "잔금날", "기타"];
const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];
const holidayMap = {
  "01-01": "신정",
  "03-01": "삼일절",
  "05-05": "어린이날",
  "06-06": "현충일",
  "08-15": "광복절",
  "10-03": "개천절",
  "10-09": "한글날",
  "12-25": "성탄절",
};

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const today = new Date();
const todayString = toDateInputValue(today);

function toMonthInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatDateLabel(dateString) {
  if (!dateString) return "";
  const [year, month, day] = dateString.split("-");
  return `${Number(year)}년 ${Number(month)}월 ${Number(day)}일`;
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
    cells.push({
      key: toDateInputValue(cursor),
      dateString: toDateInputValue(cursor),
      day: cursor.getDate(),
      dayOfWeek: cursor.getDay(),
      isCurrentMonth: cursor.getMonth() === month,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return cells;
}

function emptyForm(date = todayString) {
  return {
    title: "",
    customer_name: "",
    schedule_date: date,
    schedule_time: "",
    note: "",
    schedule_type: "일정",
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

function getNote(item) {
  return item.note || item.notes || "";
}

function SchedulesPage() {
  const [items, setItems] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayString);
  const [form, setForm] = useState(() => emptyForm(todayString));
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );

  async function fetchSchedules() {
    try {
      const data = await apiFetch("/schedules");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      setMessage(error.message || "일정 목록을 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    fetchSchedules();
  }, []);

  const schedulesByDate = useMemo(() => {
    return items.reduce((accumulator, item) => {
      const key = item.schedule_date;
      if (!key) return accumulator;
      if (!accumulator[key]) accumulator[key] = [];
      accumulator[key].push(item);
      return accumulator;
    }, {});
  }, [items]);

  const calendarCells = useMemo(() => buildCalendarCells(currentMonth), [currentMonth]);

  const monthlyItems = useMemo(() => {
    const monthPrefix = toMonthInputValue(currentMonth);
    return items
      .filter((item) => (item.schedule_date || "").startsWith(monthPrefix))
      .sort((left, right) => {
        const leftKey = `${left.schedule_date || ""} ${left.schedule_time || ""}`;
        const rightKey = `${right.schedule_date || ""} ${right.schedule_time || ""}`;
        return leftKey.localeCompare(rightKey);
      });
  }, [items, currentMonth]);

  const contractWritingItems = monthlyItems.filter((item) => item.schedule_type === "계약서작성");
  const balanceItems = monthlyItems.filter((item) => item.schedule_type === "잔금날");
  const selectedDateItems = schedulesByDate[selectedDate] || [];

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetForm(date = selectedDate) {
    setForm(emptyForm(date));
    setEditingId(null);
  }

  function handleDateSelect(cell) {
    setSelectedDate(cell.dateString);
    setForm((prev) => ({ ...prev, schedule_date: cell.dateString }));
    setPanelOpen(true);
    setMessage("");

    if (!cell.isCurrentMonth) {
      const [year, month] = cell.dateString.split("-");
      setCurrentMonth(new Date(Number(year), Number(month) - 1, 1));
    }
  }

  function handleMonthChange(value) {
    if (!value) return;
    const [year, month] = value.split("-");
    setCurrentMonth(new Date(Number(year), Number(month) - 1, 1));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const payload = {
      title: form.title.trim(),
      customer_name: form.customer_name.trim(),
      schedule_date: form.schedule_date,
      schedule_time: form.schedule_time,
      note: form.note.trim(),
      schedule_type: form.schedule_type,
    };

    try {
      if (editingId) {
        await apiFetch(`/schedules/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setMessage("일정을 수정했습니다.");
      } else {
        await apiFetch("/schedules", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("일정을 등록했습니다.");
      }

      await fetchSchedules();
      resetForm(payload.schedule_date || selectedDate);
    } catch (error) {
      setMessage(error.message || "일정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(item) {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      customer_name: item.customer_name || "",
      schedule_date: item.schedule_date || selectedDate,
      schedule_time: item.schedule_time || "",
      note: getNote(item),
      schedule_type: scheduleTypes.includes(item.schedule_type) ? item.schedule_type : "일정",
    });
    setSelectedDate(item.schedule_date || selectedDate);
    setPanelOpen(true);
    setMessage("");
  }

  async function handleDelete(itemId) {
    if (!window.confirm("이 일정을 삭제할까요?")) return;

    try {
      await apiFetch(`/schedules/${itemId}`, { method: "DELETE" });
      setMessage("일정을 삭제했습니다.");
      await fetchSchedules();
      if (editingId === itemId) resetForm();
    } catch (error) {
      setMessage(error.message || "일정을 삭제하지 못했습니다.");
    }
  }

  function renderScheduleList(list, emptyText) {
    if (!list.length) return <div className="empty-state compact-empty">{emptyText}</div>;

    return (
      <div className="mini-schedule-list">
        {list.map((item) => (
          <article key={item.id} className={`mini-schedule-item type-line-${getTypeClass(item.schedule_type)}`}>
            <div>
              <strong>{item.title || item.customer_name || "제목 없음"}</strong>
              <span>
                {item.schedule_date} {item.schedule_time || ""}
              </span>
            </div>
            <span className={`schedule-type-badge type-${getTypeClass(item.schedule_type)}`}>
              {item.schedule_type || "일정"}
            </span>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-header-card">
        <span className="section-eyebrow">월간 캘린더</span>
        <h1>일정관리</h1>
        <p>계약, 잔금, 미팅, 고객인입 일정을 달력 중심으로 확인하고 바로 수정합니다.</p>
      </section>

      {message ? <div className="inline-message">{message}</div> : null}

      <section className="schedule-board">
        <article className="panel schedule-main-panel">
          <div className="schedule-toolbar">
            <div>
              <span className="section-eyebrow">이번 달 보기</span>
              <h2>{formatMonthLabel(currentMonth)}</h2>
            </div>
            <div className="schedule-month-control">
              <input
                type="month"
                value={toMonthInputValue(currentMonth)}
                onChange={(event) => handleMonthChange(event.target.value)}
              />
              <button
                type="button"
                className="outline-btn small"
                onClick={() =>
                  setCurrentMonth(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                  )
                }
              >
                이전
              </button>
              <button
                type="button"
                className="secondary-btn small"
                onClick={() => {
                  setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                  setSelectedDate(todayString);
                  resetForm(todayString);
                }}
              >
                오늘
              </button>
              <button
                type="button"
                className="outline-btn small"
                onClick={() =>
                  setCurrentMonth(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                  )
                }
              >
                다음
              </button>
            </div>
          </div>

          <div className="calendar-frame">
            <div className="calendar-weekdays">
              {weekdayLabels.map((label, index) => (
                <span key={label} className={index === 0 || index === 6 ? "is-weekend" : ""}>
                  {label}
                </span>
              ))}
            </div>

            <div className="calendar-grid">
              {calendarCells.map((cell) => {
                const monthDay = cell.dateString.slice(5);
                const holiday = holidayMap[monthDay];
                const schedules = schedulesByDate[cell.dateString] || [];
                const isWeekend = cell.dayOfWeek === 0 || cell.dayOfWeek === 6;

                return (
                  <button
                    key={cell.key}
                    type="button"
                    className={[
                      "calendar-cell",
                      !cell.isCurrentMonth ? "is-muted" : "",
                      isWeekend ? "is-weekend" : "",
                      holiday ? "is-holiday" : "",
                      cell.dateString === todayString ? "is-today" : "",
                      cell.dateString === selectedDate ? "is-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleDateSelect(cell)}
                  >
                    <span className="calendar-day">{cell.day}</span>
                    {holiday ? <span className="calendar-holiday-label">{holiday}</span> : null}
                    <div className="calendar-events">
                      {schedules.slice(0, 3).map((item) => (
                        <span
                          key={item.id}
                          className={`schedule-type-badge type-${getTypeClass(item.schedule_type)}`}
                        >
                          {item.schedule_type || "일정"}
                        </span>
                      ))}
                      {schedules.length > 3 ? (
                        <span className="calendar-overflow">+{schedules.length - 3}</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </article>

        <aside className={`panel schedule-side-panel ${panelOpen ? "is-open" : ""}`}>
          <div className="section-heading compact-heading">
            <div>
              <span className="section-eyebrow">선택 날짜</span>
              <h2>{formatDateLabel(selectedDate)}</h2>
            </div>
            <button type="button" className="outline-btn small" onClick={() => resetForm(selectedDate)}>
              새 일정
            </button>
          </div>

          <div className="selected-day-list">
            {selectedDateItems.length ? (
              selectedDateItems.map((item) => (
                <article key={item.id} className="selected-day-item">
                  <div>
                    <strong>{item.title || item.customer_name || "제목 없음"}</strong>
                    <span>
                      {item.schedule_time || "시간 미정"} · {item.customer_name || "고객명 없음"}
                    </span>
                    {getNote(item) ? <p>{getNote(item)}</p> : null}
                  </div>
                  <div className="card-actions">
                    <button type="button" className="outline-btn small" onClick={() => handleEdit(item)}>
                      수정
                    </button>
                    <button type="button" className="danger-btn small" onClick={() => handleDelete(item.id)}>
                      삭제
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state compact-empty">이 날짜에 등록된 일정이 없습니다.</div>
            )}
          </div>

          <form className="schedule-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>일정명</span>
              <input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder="예: 역삼동 사무실 미팅"
                required
              />
            </label>
            <div className="compact-select-grid">
              <label className="field">
                <span>날짜</span>
                <input
                  type="date"
                  value={form.schedule_date}
                  onChange={(event) => {
                    updateField("schedule_date", event.target.value);
                    setSelectedDate(event.target.value);
                  }}
                  required
                />
              </label>
              <label className="field">
                <span>시간</span>
                <input
                  type="time"
                  value={form.schedule_time}
                  onChange={(event) => updateField("schedule_time", event.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span>일정 종류</span>
              <select
                value={form.schedule_type}
                onChange={(event) => updateField("schedule_type", event.target.value)}
              >
                {scheduleTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>고객명</span>
              <input
                value={form.customer_name}
                onChange={(event) => updateField("customer_name", event.target.value)}
                placeholder="예: 김은수"
              />
            </label>
            <label className="field">
              <span>메모</span>
              <textarea
                rows={4}
                value={form.note}
                onChange={(event) => updateField("note", event.target.value)}
                placeholder="상담 내용, 주소, 다음 액션을 적어주세요."
              />
            </label>
            <button type="submit" className="primary-btn full-width" disabled={saving}>
              {saving ? "저장 중..." : editingId ? "일정 수정" : "일정 등록"}
            </button>
          </form>
        </aside>
      </section>

      <section className="schedule-lists-grid">
        <article className="panel schedule-list-card">
          <h2>이번달 일정내역</h2>
          {renderScheduleList(monthlyItems, "이번 달 등록된 일정이 없습니다.")}
        </article>
        <article className="panel schedule-list-card">
          <h2>계약서작성 일정</h2>
          {renderScheduleList(contractWritingItems, "계약서작성 일정이 없습니다.")}
        </article>
        <article className="panel schedule-list-card">
          <h2>잔금날 일정</h2>
          {renderScheduleList(balanceItems, "잔금날 일정이 없습니다.")}
        </article>
      </section>
    </div>
  );
}

export default SchedulesPage;
