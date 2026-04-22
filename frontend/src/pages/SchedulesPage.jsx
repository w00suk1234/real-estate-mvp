import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import PageShell from "../components/layout/PageShell";

const emptyForm = {
  title: "",
  schedule_type: "미팅",
  schedule_date: "",
  customer_name: "",
  note: "",
};

function SchedulesPage({ setPage }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const fetchSchedules = async () => {
    const data = await apiFetch("/schedules");
    setItems(data.items || []);
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const url = editingId
      ? `/schedules/${editingId}`
      : "/schedules";

    const method = editingId ? "PUT" : "POST";

    const data = await apiFetch(url, {
      method,
      body: JSON.stringify(form),
    });

    if (!data.success) {
      alert(data.message || "일정 저장 실패");
      return;
    }

    resetForm();
    fetchSchedules();
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      schedule_type: item.schedule_type || "미팅",
      schedule_date: item.schedule_date || "",
      customer_name: item.customer_name || "",
      note: item.note || "",
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("일정을 삭제하시겠습니까?")) return;

    const data = await apiFetch(`/schedules/${id}`, {
      method: "DELETE",
    });

    if (!data.success) {
      alert(data.message || "일정 삭제 실패");
      return;
    }

    fetchSchedules();
    if (editingId === id) resetForm();
  };

  return (
    <PageShell page="schedules" setPage={setPage}>
      <div className="page-header">
        <p className="page-badge">일정 관리</p>
        <h1>일정 관리</h1>
        <p className="page-desc">계약일, 잔금일, 미팅 일정을 관리합니다.</p>
      </div>

      <div className="customer-grid">
        <section className="panel">
          <div className="panel-head">
            <h3>{editingId ? "일정 수정" : "일정 등록"}</h3>
            <p>간단한 일정 관리 1차 버전입니다.</p>
          </div>

          <form className="form-box" onSubmit={handleSubmit}>
            <div className="field">
              <label>일정명</label>
              <input
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="예: 김은수 고객 미팅"
                required
              />
            </div>

            <div className="field-grid two">
              <div className="field">
                <label>일정 종류</label>
                <select
                  value={form.schedule_type}
                  onChange={(e) =>
                    updateField("schedule_type", e.target.value)
                  }
                >
                  <option value="미팅">미팅</option>
                  <option value="계약일">계약일</option>
                  <option value="잔금일">잔금일</option>
                  <option value="기타">기타</option>
                </select>
              </div>

              <div className="field">
                <label>일정 날짜</label>
                <input
                  type="date"
                  value={form.schedule_date}
                  onChange={(e) =>
                    updateField("schedule_date", e.target.value)
                  }
                />
              </div>
            </div>

            <div className="field">
              <label>연결 고객</label>
              <input
                value={form.customer_name}
                onChange={(e) =>
                  updateField("customer_name", e.target.value)
                }
                placeholder="예: 김은수"
              />
            </div>

            <div className="field">
              <label>메모</label>
              <textarea
                rows="5"
                value={form.note}
                onChange={(e) => updateField("note", e.target.value)}
                placeholder="예: 계약서 준비, 필요 서류 확인"
              />
            </div>

            <div className="result-action-row">
              <button className="cta-btn" type="submit">
                {editingId ? "일정 수정 저장" : "일정 등록"}
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={resetForm}
              >
                초기화
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>일정 목록</h3>
            <p>등록된 일정을 확인하고 수정/삭제합니다.</p>
          </div>

          <div className="customer-list">
            {items.length === 0 ? (
              <div className="empty-box">등록된 일정이 없습니다.</div>
            ) : (
              items.map((item) => (
                <div className="customer-item" key={item.id}>
                  <div className="customer-main">
                    <div className="customer-top">
                      <strong>{item.title}</strong>
                      <div className="mini-badges">
                        <span>{item.schedule_type}</span>
                      </div>
                    </div>

                    <div className="customer-sub">
                      {item.schedule_date || "날짜 없음"}
                    </div>
                    <div className="customer-desc">
                      고객: {item.customer_name || "-"}
                      <br />
                      {item.note || "메모 없음"}
                    </div>
                    <small>{item.created_at}</small>
                  </div>

                  <div className="customer-actions">
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => handleEdit(item)}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="danger-btn"
                      onClick={() => handleDelete(item.id)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

export default SchedulesPage;
