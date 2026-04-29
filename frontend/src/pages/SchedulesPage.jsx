import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

const scheduleTypes = ["일반 일정", "미팅", "답사", "고객인입", "계약", "기타"];
const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

const today = new Date();
const todayString = today.toISOString().split("T")[0];

function formatMonthLabel(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatDateLabel(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function buildCalendarCells(currentMonth) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const leading = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const cells = [];

  for (let index = 0; index < leading; index += 1) {
    cells.push({ key: `empty-start-${index}`, isCurrentMonth: false });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, month, day);
    cells.push({
      key: date.toISOString(),
      day,
      dateString: date.toISOString().split("T")[0],
      isCurrentMonth: true,
    });
  }

  while (cells.length % 7 !== 0) {
    const index = cells.length;
    cells.push({ key: `empty-end-${index}`, isCurrentMonth: false });
  }

  return cells;
}

function emptyForm(date = todayString) {
  return {
    title: "",
    customer_name: "",
    schedule_date: date,
    schedule_time: "",
    notes: "",
    schedule_type: "일반 일정",
  };
}

function SchedulesPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(() => emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
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

  useEffect(() => {
    setMessage("");
  }, [form.schedule_date, form.schedule_type]);

  const schedulesByDate = useMemo(() => {
    return items.reduce((accumulator, item) => {
      const key = item.schedule_date;
      if (!key) return accumulator;
      if (!accumulator[key]) accumulator[key] = [];
      accumulator[key].push(item);
      return accumulator;
    }, {});
  }, [items]);

  const calendarCells = useMemo(
    () => buildCalendarCells(currentMonth),
    [currentMonth],
  );

  const monthlyItems = useMemo(() => {
    const monthPrefix = `${currentMonth.getFullYear()}-${String(
      currentMonth.getMonth() + 1,
    ).padStart(2, "0")}`;
    return items
      .filter((item) => (item.schedule_date || "").startsWith(monthPrefix))
      .sort((left, right) => {
        const leftKey = `${left.schedule_date || ""} ${left.schedule_time || ""}`;
        const rightKey = `${right.schedule_date || ""} ${right.schedule_time || ""}`;
        return leftKey.localeCompare(rightKey);
      });
  }, [items, currentMonth]);

  const selectedDateLabel = formatDateLabel(form.schedule_date);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetForm(date = todayString) {
    setForm(emptyForm(date));
    setEditingId(null);
  }

  function handleDateSelect(dateString) {
    setForm((prev) => ({ ...prev, schedule_date: dateString || prev.schedule_date }));
    setMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const payload = {
        title: form.title.trim(),
        customer_name: form.customer_name.trim(),
        schedule_date: form.schedule_date,
        schedule_time: form.schedule_time,
        notes: form.notes.trim(),
        schedule_type: form.schedule_type,
      };

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
        setMessage(
          payload.schedule_type === "고객인입"
            ? "고객인입 일정이 저장되었고 고객관리에도 자동 등록되었습니다."
            : "일정을 저장했습니다.",
        );
      }

      await fetchSchedules();
      resetForm(form.schedule_date || todayString);
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
      schedule_date: item.schedule_date || todayString,
      schedule_time: item.schedule_time || "",
      notes: item.notes || "",
      schedule_type: item.schedule_type || "일반 일정",
    });
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

  return (
    <div className="page-stack">
      <section className="page-header-card">
        <span className="section-eyebrow">월간 캘린더</span>
        <h1>일정관리</h1>
        <p>
          달력에서 날짜를 선택해 일정을 등록하고, 고객인입 일정은 고객관리와
          바로 연결해 관리할 수 있습니다.
        </p>
      </section>

      <section className="panel schedule-hero">
        <div className="schedule-calendar-panel">
          <div className="schedule-toolbar">
            <div>
              <span className="section-eyebrow">이번 달 보기</span>
              <h2>{formatMonthLabel(currentMonth)}</h2>
            </div>

            <div className="month-nav">
              <button
                type="button"
                className="outline-btn"
                onClick={() =>
                  setCurrentMonth(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                  )
                }
              >
                이전 달
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() =>
                  setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1))
                }
              >
                이번 달
              </button>
              <button
                type="button"
                className="outline-btn"
                onClick={() =>
                  setCurrentMonth(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                  )
                }
              >
                다음 달
              </button>
            </div>
          </div>

          <div className="calendar-frame">
            <div className="calendar-weekdays">
              {weekdayLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            <div className="calendar-grid">
              {calendarCells.map((cell) =>
                cell.isCurrentMonth ? (
                  <button
                    key={cell.key}
                    type="button"
                    className={`calendar-cell ${
                      form.schedule_date === cell.dateString ? "selected" : ""
                    } ${cell.dateString === todayString ? "today" : ""}`}
                    onClick={() => handleDateSelect(cell.dateString)}
                  >
                    <span className="calendar-day">{cell.day}</span>
                    <div className="calendar-events">
                      {(schedulesByDate[cell.dateString] || []).slice(0, 2).map((item) => (
                        <span key={item.id} className="calendar-chip">
                          {item.title}
                        </span>
                      ))}
                      {(schedulesByDate[cell.dateString] || []).length > 2 ? (
                        <span className="calendar-chip muted">
                          +{(schedulesByDate[cell.dateString] || []).length - 2}건
                        </span>
                      ) : null}
                    </div>
                  </button>
                ) : (
                  <div key={cell.key} className="calendar-cell empty" />
                ),
              )}
            </div>
          </div>
        </div>

        <aside className="panel schedule-form-panel">
          <div className="schedule-form-header">
            <div>
              <span className="section-eyebrow">선택 날짜</span>
              <h2>{selectedDateLabel || "일정을 등록할 날짜를 선택하세요"}</h2>
            </div>
            <button
              type="button"
              className="outline-btn"
              onClick={() => resetForm(form.schedule_date || todayString)}
            >
              새 일정
            </button>
          </div>

          <form className="form-grid compact" onSubmit={handleSubmit}>
            <label className="field span-2">
              <span>일정명</span>
              <input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder="예: 역삼동 사무실 현장 미팅"
                required
              />
            </label>

            <label className="field">
              <span>날짜</span>
              <input
                type="date"
                value={form.schedule_date}
                onChange={(event) => updateField("schedule_date", event.target.value)}
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
                placeholder="고객인입 일정이면 함께 적어두세요"
              />
            </label>

            <label className="field span-2">
              <span>메모</span>
              <textarea
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                rows={4}
                placeholder="현장 주소, 준비물, 상담 포인트 등을 적어두세요"
              />
            </label>

            <div className="form-actions span-2">
              <button type="submit" className="primary-btn" disabled={saving}>
                {editingId ? "일정 수정" : "일정 저장"}
              </button>
            </div>
          </form>

          {message ? <p className="form-message">{message}</p> : null}
        </aside>
      </section>

      <section className="panel schedule-table-panel">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">이번 달 일정</span>
            <h2>이번 달 일정 내역</h2>
          </div>
          <span className="section-count">{monthlyItems.length}건</span>
        </div>

        {monthlyItems.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>시간</th>
                  <th>일정명</th>
                  <th>종류</th>
                  <th>메모</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {monthlyItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.schedule_date || "-"}</td>
                    <td>{item.schedule_time || "-"}</td>
                    <td>{item.title}</td>
                    <td>{item.schedule_type || "-"}</td>
                    <td>{item.notes || "-"}</td>
                    <td>
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="outline-btn small"
                          onClick={() => handleEdit(item)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="text-btn danger"
                          onClick={() => handleDelete(item.id)}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            이번 달에 등록된 일정이 없습니다. 달력에서 날짜를 눌러 첫 일정을
            등록해 보세요.
          </p>
        )}
      </section>
    </div>
  );
}

export default SchedulesPage;
