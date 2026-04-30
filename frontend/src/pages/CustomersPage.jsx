import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

const contractStatuses = ["미계약", "계약금입금", "잔금완료", "삭제"];
const priorityLevels = ["낮음", "보통", "높음"];
const meetingStatuses = ["미팅 전", "미팅 예정", "미팅 완료"];
const ALL = "전체";
const PAGE_SIZE = 10;

const defaultForm = {
  name: "",
  phone: "",
  wanted_condition: "",
  contract_status: "미계약",
  priority: "보통",
  meeting_status: "미팅 전",
  source: "",
  inflow_date: "",
  memo: "",
};

function getStatusClass(status) {
  if (status === "계약금입금") return "deposit";
  if (status === "잔금완료") return "complete";
  if (status === "삭제") return "deleted";
  return "default";
}

function getCustomerValue(item, key) {
  if (key === "wanted_condition") return item.wanted_condition || item.requirement || "";
  if (key === "memo") return item.memo || item.notes || "";
  if (key === "inflow_date") return item.inflow_date || item.inquiry_date || "";
  return item[key] || "";
}

function CustomersPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [priorityFilter, setPriorityFilter] = useState(ALL);
  const [meetingFilter, setMeetingFilter] = useState(ALL);
  const [page, setPage] = useState(1);
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
    const keyword = search.trim().toLowerCase();

    return items.filter((item) => {
      const haystack = [
        getCustomerValue(item, "name"),
        getCustomerValue(item, "phone"),
        getCustomerValue(item, "wanted_condition"),
        getCustomerValue(item, "memo"),
        getCustomerValue(item, "source"),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !keyword || haystack.includes(keyword);
      const matchesStatus =
        statusFilter === ALL || getCustomerValue(item, "contract_status") === statusFilter;
      const matchesPriority =
        priorityFilter === ALL || getCustomerValue(item, "priority") === priorityFilter;
      const matchesMeeting =
        meetingFilter === ALL || getCustomerValue(item, "meeting_status") === meetingFilter;

      return matchesSearch && matchesStatus && matchesPriority && matchesMeeting;
    });
  }, [items, search, statusFilter, priorityFilter, meetingFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedItems = filteredItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, priorityFilter, meetingFilter]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetForm() {
    setForm(defaultForm);
    setEditingId(null);
  }

  async function createCustomerInflowSchedule(payload) {
    if (!payload.inflow_date || !payload.name) return;

    try {
      await apiFetch("/schedules", {
        method: "POST",
        body: JSON.stringify({
          title: `${payload.name} 고객인입`,
          customer_name: payload.name,
          schedule_date: payload.inflow_date,
          schedule_time: "",
          schedule_type: "고객인입",
          note: [payload.phone, payload.source, payload.memo].filter(Boolean).join("\n"),
        }),
      });
    } catch {
      setMessage("고객은 저장됐지만 고객인입 일정 자동 등록은 실패했습니다.");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const payload = {
      ...form,
      name: form.name.trim(),
      phone: form.phone.trim(),
      wanted_condition: form.wanted_condition.trim(),
      source: form.source.trim(),
      inflow_date: form.inflow_date || "",
      memo: form.memo.trim(),
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
        await createCustomerInflowSchedule(payload);
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
      name: getCustomerValue(item, "name"),
      phone: getCustomerValue(item, "phone"),
      wanted_condition: getCustomerValue(item, "wanted_condition"),
      contract_status: getCustomerValue(item, "contract_status") || "미계약",
      priority: getCustomerValue(item, "priority") || "보통",
      meeting_status: getCustomerValue(item, "meeting_status") || "미팅 전",
      source: getCustomerValue(item, "source"),
      inflow_date: getCustomerValue(item, "inflow_date"),
      memo: getCustomerValue(item, "memo"),
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
        <span className="section-eyebrow">고객 관리</span>
        <h1>고객관리</h1>
        <p>고객 목록을 중심으로 확인하고, 오른쪽에서 빠르게 신규 고객을 등록합니다.</p>
      </section>

      {message ? <div className="inline-message">{message}</div> : null}

      <section className="customer-layout">
        <article className="panel customer-list-card">
          <div className="section-heading">
            <div>
              <span className="section-eyebrow">목록 / 필터</span>
              <h2>고객 목록</h2>
              <p>총 {filteredItems.length}명의 고객이 표시됩니다.</p>
            </div>
          </div>

          <div className="customer-filter-grid">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="고객명, 연락처, 희망 지역, 조건 검색"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {[ALL, ...contractStatuses].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
            >
              {[ALL, ...priorityLevels].map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
            <select
              value={meetingFilter}
              onChange={(event) => setMeetingFilter(event.target.value)}
            >
              {[ALL, ...meetingStatuses].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="customer-card-list">
            {pagedItems.length ? (
              pagedItems.map((item) => {
                const status = getCustomerValue(item, "contract_status") || "미계약";
                const statusClass = getStatusClass(status);

                return (
                  <article
                    className={`customer-card-item contract-strip-${statusClass}`}
                    key={item.id}
                  >
                    <div className="customer-card-head">
                      <div>
                        <strong>{getCustomerValue(item, "name") || "이름 미입력"}</strong>
                        <span>{getCustomerValue(item, "phone") || "연락처 없음"}</span>
                      </div>
                      <span className={`status-badge status-${statusClass}`}>{status}</span>
                    </div>

                    <div className="customer-meta-grid">
                      <span>조건</span>
                      <p>{getCustomerValue(item, "wanted_condition") || "조건 미입력"}</p>
                      <span>유입일</span>
                      <p>{getCustomerValue(item, "inflow_date") || "미지정"}</p>
                      <span>중요도</span>
                      <p>{getCustomerValue(item, "priority") || "보통"}</p>
                      <span>미팅</span>
                      <p>{getCustomerValue(item, "meeting_status") || "미팅 전"}</p>
                    </div>

                    {getCustomerValue(item, "memo") ? (
                      <p className="customer-note">{getCustomerValue(item, "memo")}</p>
                    ) : null}

                    <div className="card-actions">
                      <button type="button" className="outline-btn small" onClick={() => handleEdit(item)}>
                        수정
                      </button>
                      <button type="button" className="danger-btn small" onClick={() => handleDelete(item.id)}>
                        삭제
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="empty-state">조건에 맞는 고객이 없습니다.</div>
            )}
          </div>

          <div className="pagination-row">
            <button
              type="button"
              className="outline-btn small"
              disabled={safePage <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              이전
            </button>
            <div className="pagination-pages">
              {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
                const number = index + 1;
                return (
                  <button
                    key={number}
                    type="button"
                    className={`pagination-page-btn ${number === safePage ? "active" : ""}`}
                    onClick={() => setPage(number)}
                  >
                    {number}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="outline-btn small"
              disabled={safePage >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              다음
            </button>
          </div>
        </article>

        <aside className="panel customer-form-card">
          <div className="section-heading compact-heading">
            <div>
              <span className="section-eyebrow">빠른 입력</span>
              <h2>{editingId ? "고객 수정" : "고객 등록"}</h2>
            </div>
            {editingId ? (
              <button type="button" className="outline-btn small" onClick={resetForm}>
                신규
              </button>
            ) : null}
          </div>

          <form className="customer-compact-form" onSubmit={handleSubmit}>
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
            <label className="field">
              <span>찾는 조건</span>
              <textarea
                rows={3}
                value={form.wanted_condition}
                onChange={(event) => updateField("wanted_condition", event.target.value)}
                placeholder="예: 역삼동 소형 사무실, 주차 1대"
              />
            </label>
            <label className="field">
              <span>고객 유입일</span>
              <input
                type="date"
                value={form.inflow_date}
                onChange={(event) => updateField("inflow_date", event.target.value)}
              />
            </label>
            <div className="compact-select-grid">
              <label className="field">
                <span>계약상태</span>
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
            </div>
            <label className="field">
              <span>미팅 여부</span>
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
                placeholder="예: 고객인입 일정, 소개, 광고"
              />
            </label>
            <label className="field">
              <span>메모</span>
              <textarea
                rows={4}
                value={form.memo}
                onChange={(event) => updateField("memo", event.target.value)}
                placeholder="상담 내용과 다음 액션을 적어주세요."
              />
            </label>
            <button type="submit" className="primary-btn full-width" disabled={saving}>
              {saving ? "저장 중..." : editingId ? "수정 저장" : "고객 등록"}
            </button>
          </form>
        </aside>
      </section>
    </div>
  );
}

export default CustomersPage;
