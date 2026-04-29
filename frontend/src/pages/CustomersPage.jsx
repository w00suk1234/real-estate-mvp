import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

const contractStatuses = ["미계약", "진행중", "계약완료"];
const priorityLevels = ["낮음", "보통", "높음"];
const meetingStatuses = ["미팅 전", "미팅 예정", "미팅 완료"];

const defaultForm = {
  name: "",
  phone: "",
  requirement: "",
  contract_status: contractStatuses[0],
  priority: priorityLevels[1],
  meeting_status: meetingStatuses[0],
  source: "",
  inquiry_date: "",
  notes: "",
};

function CustomersPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [priorityFilter, setPriorityFilter] = useState("전체");
  const [meetingFilter, setMeetingFilter] = useState("전체");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function fetchCustomers() {
    try {
      const data = await apiFetch("/customers");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      setMessage(error.message || "고객 목록을 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = [item.name, item.phone, item.requirement, item.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase());

      const matchesStatus =
        statusFilter === "전체" || item.contract_status === statusFilter;
      const matchesPriority =
        priorityFilter === "전체" || item.priority === priorityFilter;
      const matchesMeeting =
        meetingFilter === "전체" || item.meeting_status === meetingFilter;

      return matchesSearch && matchesStatus && matchesPriority && matchesMeeting;
    });
  }, [items, search, statusFilter, priorityFilter, meetingFilter]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetForm() {
    setForm(defaultForm);
    setEditingId(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const payload = {
      ...form,
      name: form.name.trim(),
      phone: form.phone.trim(),
      requirement: form.requirement.trim(),
      source: form.source.trim(),
      inquiry_date: form.inquiry_date || null,
      notes: form.notes.trim(),
    };

    try {
      if (editingId) {
        await apiFetch(`/customers/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setMessage("고객 정보를 수정했습니다.");
      } else {
        await apiFetch("/customers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("고객 정보를 등록했습니다.");
      }

      await fetchCustomers();
      resetForm();
    } catch (error) {
      setMessage(error.message || "고객 정보를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(item) {
    setEditingId(item.id);
    setForm({
      name: item.name || "",
      phone: item.phone || "",
      requirement: item.requirement || "",
      contract_status: item.contract_status || contractStatuses[0],
      priority: item.priority || priorityLevels[1],
      meeting_status: item.meeting_status || meetingStatuses[0],
      source: item.source || "",
      inquiry_date: item.inquiry_date || "",
      notes: item.notes || "",
    });
    setMessage("");
  }

  async function handleDelete(id) {
    if (!window.confirm("이 고객 정보를 삭제할까요?")) return;

    try {
      await apiFetch(`/customers/${id}`, { method: "DELETE" });
      setMessage("고객 정보를 삭제했습니다.");
      await fetchCustomers();
      if (editingId === id) resetForm();
    } catch (error) {
      setMessage(error.message || "고객 정보를 삭제하지 못했습니다.");
    }
  }

  return (
    <div className="page-stack">
      <section className="page-header-card">
        <span className="section-eyebrow">실무 고객 관리</span>
        <h1>고객관리</h1>
        <p>
          고객 등록과 목록 확인을 한 화면에서 진행하고, 고객인입 일정과 연결된
          흐름까지 함께 관리하세요.
        </p>
      </section>

      <section className="customer-grid customer-grid-balanced">
        <div className="panel customer-form-card">
          <div className="section-heading">
            <div>
              <span className="section-eyebrow">신규 등록</span>
              <h2>{editingId ? "고객 정보 수정" : "고객 등록"}</h2>
            </div>
            {editingId ? (
              <button type="button" className="outline-btn small" onClick={resetForm}>
                새 등록으로 전환
              </button>
            ) : null}
          </div>

          <form className="form-grid compact" onSubmit={handleSubmit}>
            <label className="field">
              <span>고객명</span>
              <input
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="예: 김은수"
                required
              />
            </label>

            <label className="field">
              <span>연락처</span>
              <input
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="예: 010-1234-5678"
              />
            </label>

            <label className="field span-2">
              <span>찾는 조건</span>
              <textarea
                rows={3}
                value={form.requirement}
                onChange={(event) => updateField("requirement", event.target.value)}
                placeholder="예: 역삼동 소형 사무실, 엘리베이터, 주차 1대"
              />
            </label>

            <label className="field">
              <span>계약 상태</span>
              <select
                value={form.contract_status}
                onChange={(event) => updateField("contract_status", event.target.value)}
              >
                {contractStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>중요도</span>
              <select
                value={form.priority}
                onChange={(event) => updateField("priority", event.target.value)}
              >
                {priorityLevels.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>미팅 상태</span>
              <select
                value={form.meeting_status}
                onChange={(event) => updateField("meeting_status", event.target.value)}
              >
                {meetingStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>유입 경로</span>
              <input
                value={form.source}
                onChange={(event) => updateField("source", event.target.value)}
                placeholder="예: 고객인입 일정, 소개, 광고 문의"
              />
            </label>

            <label className="field">
              <span>유입일</span>
              <input
                type="date"
                value={form.inquiry_date}
                onChange={(event) => updateField("inquiry_date", event.target.value)}
              />
            </label>

            <label className="field span-2">
              <span>메모 / 비고</span>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="추가 상담 내용, 다음 액션, 유의사항을 적어두세요"
              />
            </label>

            <div className="form-actions span-2">
              <button type="submit" className="primary-btn" disabled={saving}>
                {editingId ? "고객 정보 저장" : "고객 등록"}
              </button>
            </div>
          </form>

          {message ? <p className="form-message">{message}</p> : null}
        </div>

        <div className="panel customer-list-card">
          <div className="section-heading">
            <div>
              <span className="section-eyebrow">목록 / 검색</span>
              <h2>고객 목록</h2>
            </div>
            <span className="section-count">{filteredItems.length}명</span>
          </div>

          <div className="compact-filter-grid">
            <label className="field search-field">
              <span className="sr-only">검색</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="이름, 연락처, 조건, 메모 검색"
              />
            </label>

            <label className="field">
              <span>계약상태</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="전체">전체</option>
                {contractStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>중요도</span>
              <select
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
              >
                <option value="전체">전체</option>
                {priorityLevels.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>미팅상태</span>
              <select
                value={meetingFilter}
                onChange={(event) => setMeetingFilter(event.target.value)}
              >
                <option value="전체">전체</option>
                {meetingStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filteredItems.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>고객명</th>
                    <th>연락처</th>
                    <th>조건</th>
                    <th>상태</th>
                    <th>중요도</th>
                    <th>미팅</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.phone || "-"}</td>
                      <td>{item.requirement || "-"}</td>
                      <td>{item.contract_status || "-"}</td>
                      <td>{item.priority || "-"}</td>
                      <td>{item.meeting_status || "-"}</td>
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
              조건에 맞는 고객이 없습니다. 왼쪽에서 새 고객을 등록하거나 검색
              조건을 조정해 보세요.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

export default CustomersPage;
