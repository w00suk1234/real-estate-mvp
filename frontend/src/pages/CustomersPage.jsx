import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";
import PageShell from "../components/layout/PageShell";

const emptyForm = {
  name: "",
  phone: "",
  wanted_condition: "",
  contract_status: "미계약",
  priority: "보통",
  meeting_status: "미팅 전",
  memo: "",
  source: "",
  inflow_date: "",
};

function CustomersPage({ setPage }) {
  const { isAuthenticated } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [contractFilter, setContractFilter] = useState("전체");
  const [priorityFilter, setPriorityFilter] = useState("전체");
  const [meetingFilter, setMeetingFilter] = useState("전체");

  const fetchCustomers = async () => {
    if (!isAuthenticated) {
      setCustomers([]);
      return;
    }
    const data = await apiFetch("/customers");
    setCustomers(data.items || []);
  };

  useEffect(() => {
    fetchCustomers();
  }, [isAuthenticated]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((item) => {
      const text = `${item.name || ""} ${item.phone || ""} ${item.wanted_condition || ""} ${item.memo || ""} ${item.source || ""}`.toLowerCase();
      const matchesSearch = text.includes(search.toLowerCase());
      const matchesContract = contractFilter === "전체" || item.contract_status === contractFilter;
      const matchesPriority = priorityFilter === "전체" || item.priority === priorityFilter;
      const matchesMeeting = meetingFilter === "전체" || item.meeting_status === meetingFilter;
      return matchesSearch && matchesContract && matchesPriority && matchesMeeting;
    });
  }, [customers, search, contractFilter, priorityFilter, meetingFilter]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isAuthenticated) {
      alert("고객 정보를 저장하려면 먼저 로그인해 주세요.");
      setPage?.("login");
      return;
    }

    const url = editingId ? `/customers/${editingId}` : "/customers";
    const method = editingId ? "PUT" : "POST";

    const data = await apiFetch(url, {
      method,
      body: JSON.stringify(form),
    });

    if (!data.success) {
      alert(data.message || "고객 저장에 실패했습니다.");
      return;
    }

    resetForm();
    fetchCustomers();
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name || "",
      phone: item.phone || "",
      wanted_condition: item.wanted_condition || "",
      contract_status: item.contract_status || "미계약",
      priority: item.priority || "보통",
      meeting_status: item.meeting_status || "미팅 전",
      memo: item.memo || "",
      source: item.source || "",
      inflow_date: item.inflow_date || "",
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("고객 정보를 삭제할까요?")) return;
    const data = await apiFetch(`/customers/${id}`, { method: "DELETE" });
    if (!data.success) {
      alert(data.message || "고객 삭제에 실패했습니다.");
      return;
    }
    await fetchCustomers();
    if (editingId === id) resetForm();
  };

  return (
    <PageShell page="customers" setPage={setPage}>
      <div className="page-stack">
        <section className="surface-card">
          <div className="section-kicker">고객관리</div>
          <h1 className="section-title">고객 인입부터 후속 메모까지 한 화면에서 관리</h1>
          <p className="section-copy">
            일정관리에서 고객인입으로 저장한 일정도 여기로 자동 연결됩니다. 직접 등록한 고객과 함께 한 흐름에서 관리해 주세요.
          </p>
        </section>

        <div className="customer-grid">
          <section className="surface-card">
            <div className="card-header-row">
              <div>
                <h2 className="card-title">{editingId ? "고객 정보 수정" : "고객 등록"}</h2>
                <p className="card-copy">기본 정보와 원하는 조건, 유입 경로를 함께 남겨두세요.</p>
              </div>
            </div>

            <form className="profile-form" onSubmit={handleSubmit}>
              <div className="field-grid two">
                <label className="field">
                  <span>고객명</span>
                  <input
                    value={form.name}
                    onChange={(event) => updateField("name", event.target.value)}
                    placeholder="예: 김의뢰"
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
              </div>

              <label className="field">
                <span>찾는 조건</span>
                <textarea
                  rows="4"
                  value={form.wanted_condition}
                  onChange={(event) => updateField("wanted_condition", event.target.value)}
                  placeholder="예: 강남권 소형 사무실 / 엘리베이터 / 주차 1대 이상"
                />
              </label>

              <div className="field-grid three">
                <label className="field">
                  <span>계약 상태</span>
                  <select value={form.contract_status} onChange={(event) => updateField("contract_status", event.target.value)}>
                    <option value="미계약">미계약</option>
                    <option value="진행중">진행중</option>
                    <option value="계약완료">계약완료</option>
                  </select>
                </label>

                <label className="field">
                  <span>중요도</span>
                  <select value={form.priority} onChange={(event) => updateField("priority", event.target.value)}>
                    <option value="낮음">낮음</option>
                    <option value="보통">보통</option>
                    <option value="높음">높음</option>
                  </select>
                </label>

                <label className="field">
                  <span>미팅 상태</span>
                  <select value={form.meeting_status} onChange={(event) => updateField("meeting_status", event.target.value)}>
                    <option value="미팅 전">미팅 전</option>
                    <option value="미팅 예정">미팅 예정</option>
                    <option value="미팅 완료">미팅 완료</option>
                  </select>
                </label>
              </div>

              <div className="field-grid two">
                <label className="field">
                  <span>유입 경로</span>
                  <input
                    value={form.source}
                    onChange={(event) => updateField("source", event.target.value)}
                    placeholder="예: 고객인입 일정 / 직접 등록"
                  />
                </label>

                <label className="field">
                  <span>유입일</span>
                  <input
                    type="date"
                    value={form.inflow_date}
                    onChange={(event) => updateField("inflow_date", event.target.value)}
                  />
                </label>
              </div>

              <label className="field">
                <span>메모 / 비고</span>
                <textarea
                  rows="5"
                  value={form.memo}
                  onChange={(event) => updateField("memo", event.target.value)}
                  placeholder="상담 선호 시간, 후속 연락 예정일, 계약 주의사항 등을 남겨두세요."
                />
              </label>

              <div className="form-actions">
                <button type="submit" className="primary-btn">
                  {editingId ? "고객 정보 저장" : "고객 등록"}
                </button>
                <button type="button" className="secondary-btn" onClick={resetForm}>
                  초기화
                </button>
              </div>
            </form>
          </section>

          <section className="surface-card">
            <div className="card-header-row">
              <div>
                <h2 className="card-title">고객 목록</h2>
                <p className="card-copy">검색과 상태 필터로 현재 진행 중인 고객을 빠르게 찾을 수 있습니다.</p>
              </div>
            </div>

            <div className="field-grid two filter-grid">
              <label className="field">
                <span>검색</span>
                <input
                  placeholder="이름, 연락처, 조건, 메모"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>

              <label className="field">
                <span>계약 상태</span>
                <select value={contractFilter} onChange={(event) => setContractFilter(event.target.value)}>
                  <option value="전체">전체</option>
                  <option value="미계약">미계약</option>
                  <option value="진행중">진행중</option>
                  <option value="계약완료">계약완료</option>
                </select>
              </label>

              <label className="field">
                <span>중요도</span>
                <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                  <option value="전체">전체</option>
                  <option value="낮음">낮음</option>
                  <option value="보통">보통</option>
                  <option value="높음">높음</option>
                </select>
              </label>

              <label className="field">
                <span>미팅 상태</span>
                <select value={meetingFilter} onChange={(event) => setMeetingFilter(event.target.value)}>
                  <option value="전체">전체</option>
                  <option value="미팅 전">미팅 전</option>
                  <option value="미팅 예정">미팅 예정</option>
                  <option value="미팅 완료">미팅 완료</option>
                </select>
              </label>
            </div>

            <div className="customer-list">
              {filteredCustomers.length === 0 ? (
                <div className="empty-hint">조건에 맞는 고객이 아직 없습니다.</div>
              ) : (
                filteredCustomers.map((item) => (
                  <article className="customer-item" key={item.id}>
                    <div className="customer-main">
                      <div className="customer-top">
                        <strong>{item.name}</strong>
                        <div className="mini-badges">
                          <span>{item.contract_status}</span>
                          <span>{item.priority}</span>
                          <span>{item.meeting_status}</span>
                        </div>
                      </div>

                      <div className="customer-sub">{item.phone || "연락처 없음"}</div>

                      {item.source || item.inflow_date ? (
                        <div className="customer-source">
                          {item.source ? <span>{item.source}</span> : null}
                          {item.inflow_date ? <span>{item.inflow_date}</span> : null}
                        </div>
                      ) : null}

                      {item.wanted_condition ? <div className="customer-desc">{item.wanted_condition}</div> : null}
                      {item.memo ? <div className="customer-note">{item.memo}</div> : null}
                    </div>

                    <div className="customer-actions">
                      <button type="button" className="secondary-btn small-btn" onClick={() => handleEdit(item)}>
                        수정
                      </button>
                      <button type="button" className="danger-btn small-btn" onClick={() => handleDelete(item.id)}>
                        삭제
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  );
}

export default CustomersPage;
