import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";
import PageShell from "../components/layout/PageShell";

const scheduleTypes = ["고객인입", "미팅", "현장답사", "계약", "입금", "기타"];
const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];
const todayString = new Date().toISOString().slice(0, 10);

const emptyForm = {
  title: "",
  schedule_type: "미팅",
  schedule_date: todayString,
  schedule_time: "",
  customer_name: "",
  note: "",
};

function formatMonthLabel(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function buildCalendarCells(baseDate) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  const cells = [];
  const current = new Date(start);
  while (cells.length < 42) {
    const iso = current.toISOString().slice(0, 10);
    cells.push({
      key: `${iso}-${cells.length}`,
      date: iso,
      day: current.getDate(),
      isCurrentMonth: current.getMonth() === month,
      isToday: iso === todayString,
    });
    current.setDate(current.getDate() + 1);
  }
  return cells;
}

function SchedulesPage({ setPage }) {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const fetchSchedules = async () => {
    if (!isAuthenticated) {
      setItems([]);
      return;
    }
    const data = await apiFetch("/schedules");
    setItems(data.items || []);
  };

  useEffect(() => {
    fetchSchedules();
  }, [isAuthenticated]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = (date = todayString) => {
    setForm({ ...emptyForm, schedule_date: date });
    setEditingId(null);
    setMessage("");
  };

  const handleDateSelect = (date) => {
    setForm((prev) => ({ ...prev, schedule_date: date }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isAuthenticated) {
      alert("일정을 저장하려면 먼저 로그인해 주세요.");
      setPage?.("login");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const payload = {
        ...form,
        customer_name: form.schedule_type === "고객인입" ? form.customer_name || form.title : form.customer_name,
      };
      const url = editingId ? `/schedules/${editingId}` : "/schedules";
      const method = editingId ? "PUT" : "POST";
      const data = await apiFetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      if (!data.success) {
        throw new Error(data.message || "일정 저장에 실패했습니다.");
      }

      setMessage(
        payload.schedule_type === "고객인입"
          ? "고객인입 일정이 저장되었고 고객관리에도 자동 등록되었습니다."
          : "일정이 저장되었습니다.",
      );
      resetForm(payload.schedule_date || todayString);
      await fetchSchedules();
    } catch (error) {
      alert(error.message || "일정 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      schedule_type: item.schedule_type || "미팅",
      schedule_date: item.schedule_date || todayString,
      schedule_time: item.schedule_time || "",
      customer_name: item.customer_name || "",
      note: item.note || "",
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("이 일정을 삭제할까요?")) return;
    const data = await apiFetch(`/schedules/${id}`, { method: "DELETE" });
    if (!data.success) {
      alert(data.message || "일정 삭제에 실패했습니다.");
      return;
    }
    await fetchSchedules();
    if (editingId === id) resetForm();
  };

  const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;
  const monthlyItems = useMemo(
    () => items.filter((item) => String(item.schedule_date || "").startsWith(monthKey)),
    [items, monthKey],
  );

  const schedulesByDate = useMemo(() => {
    const map = new Map();
    monthlyItems.forEach((item) => {
      const key = item.schedule_date || "";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }, [monthlyItems]);

  const calendarCells = useMemo(() => buildCalendarCells(currentMonth), [currentMonth]);

  return (
    <PageShell page="schedules" setPage={setPage}>
      <div className="page-stack">
        <section className="surface-card">
          <div className="section-kicker">메인 일정관리</div>
          <h1 className="section-title">이번 달 일정 흐름을 한눈에 확인하세요</h1>
          <p className="section-copy">
            날짜를 클릭하면 해당 날짜 기준으로 일정 등록 폼이 열리고, 고객인입 일정은 고객관리에도 자동 반영됩니다.
          </p>
        </section>

        <section className="schedule-hero">
          <div className="surface-card schedule-calendar-panel">
            <div className="schedule-calendar-head">
              <div>
                <h2 className="card-title">{formatMonthLabel(currentMonth)}</h2>
                <p className="card-copy">월별 일정을 빠르게 훑고 바로 등록할 수 있습니다.</p>
              </div>

              <div className="calendar-nav">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                >
                  이전 달
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    const now = new Date();
                    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                    handleDateSelect(todayString);
                  }}
                >
                  이번 달
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                >
                  다음 달
                </button>
              </div>
            </div>

            <div className="calendar-grid">
              {weekdayLabels.map((label) => (
                <div key={label} className="calendar-weekday">
                  {label}
                </div>
              ))}

              {calendarCells.map((cell) => {
                const daySchedules = schedulesByDate.get(cell.date) || [];
                const isSelected = form.schedule_date === cell.date;

                return (
                  <button
                    type="button"
                    key={cell.key}
                    className={[
                      "calendar-cell",
                      cell.isCurrentMonth ? "" : "is-muted",
                      cell.isToday ? "is-today" : "",
                      isSelected ? "is-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleDateSelect(cell.date)}
                  >
                    <div className="calendar-cell-top">
                      <span>{cell.day}</span>
                      {daySchedules.length ? <strong>{daySchedules.length}건</strong> : null}
                    </div>
                    <div className="calendar-cell-body">
                      {daySchedules.slice(0, 2).map((item) => (
                        <span key={item.id} className="calendar-dot">
                          {item.schedule_type}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="surface-card schedule-form-panel">
            <div className="card-header-row">
              <div>
                <div className="section-kicker">{editingId ? "일정 수정" : "일정 등록"}</div>
                <h2 className="card-title">{form.schedule_date || "날짜 선택"}</h2>
                <p className="card-copy">날짜를 누르면 해당 일정으로 바로 입력할 수 있습니다.</p>
              </div>
              <button type="button" className="secondary-btn" onClick={() => resetForm(form.schedule_date || todayString)}>
                새 일정
              </button>
            </div>

            {message ? <div className="schedule-inline-alert">{message}</div> : null}

            <form className="profile-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>일정명</span>
                <input
                  value={form.title}
                  onChange={(event) => updateField("title", event.target.value)}
                  placeholder="예: 역삼동 사무실 현장 미팅"
                  required
                />
              </label>

              <div className="field-grid two">
                <label className="field">
                  <span>날짜</span>
                  <input
                    type="date"
                    value={form.schedule_date}
                    onChange={(event) => updateField("schedule_date", event.target.value)}
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
                <span>일정종류</span>
                <select value={form.schedule_type} onChange={(event) => updateField("schedule_type", event.target.value)}>
                  {scheduleTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              {form.schedule_type === "고객인입" ? (
                <label className="field">
                  <span>고객명</span>
                  <input
                    value={form.customer_name}
                    onChange={(event) => updateField("customer_name", event.target.value)}
                    placeholder="비워두면 일정명 기준으로 고객이 생성됩니다."
                  />
                </label>
              ) : null}

              <label className="field">
                <span>메모</span>
                <textarea
                  rows="5"
                  value={form.note}
                  onChange={(event) => updateField("note", event.target.value)}
                  placeholder="상담 내용, 주소, 준비 사항 등을 남겨두세요."
                />
              </label>

              <div className="form-actions">
                <button type="submit" className="primary-btn" disabled={saving}>
                  {saving ? "저장 중..." : editingId ? "일정 수정" : "일정 저장"}
                </button>
              </div>
            </form>
          </aside>
        </section>

        <section className="surface-card schedule-table-panel">
          <div className="card-header-row">
            <div>
              <div className="section-kicker">이번 달 일정 내역</div>
              <h2 className="card-title">월간 일정 목록</h2>
            </div>
          </div>

          <div className="schedule-table-wrap">
            <table className="schedule-table">
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
                {monthlyItems.length ? (
                  monthlyItems
                    .slice()
                    .sort((a, b) =>
                      `${a.schedule_date || ""} ${a.schedule_time || ""}`.localeCompare(
                        `${b.schedule_date || ""} ${b.schedule_time || ""}`,
                      ),
                    )
                    .map((item) => (
                      <tr key={item.id}>
                        <td>{item.schedule_date}</td>
                        <td>{item.schedule_time || "-"}</td>
                        <td>
                          <strong>{item.title}</strong>
                          {item.customer_name ? <div className="table-note">고객명: {item.customer_name}</div> : null}
                        </td>
                        <td>
                          <span className="table-badge">{item.schedule_type}</span>
                        </td>
                        <td className="table-note">{item.note || "-"}</td>
                        <td>
                          <div className="table-action-row">
                            <button type="button" className="secondary-btn small-btn" onClick={() => handleEdit(item)}>
                              수정
                            </button>
                            <button type="button" className="danger-btn small-btn" onClick={() => handleDelete(item.id)}>
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td colSpan="6">
                      <div className="empty-hint">이번 달에 등록된 일정이 아직 없습니다.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

export default SchedulesPage;
