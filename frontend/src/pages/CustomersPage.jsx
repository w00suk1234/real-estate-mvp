import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import PageShell from "../components/layout/PageShell";

const emptyForm = {
  name: "",
  phone: "",
  wanted_condition: "",
  contract_status: "미계약",
  priority: "보통",
  meeting_status: "미팅 전",
  memo: "",
};

function CustomersPage({ setPage }) {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const [search, setSearch] = useState("");
  const [contractFilter, setContractFilter] = useState("전체");
  const [priorityFilter, setPriorityFilter] = useState("전체");
  const [meetingFilter, setMeetingFilter] = useState("전체");

  const fetchCustomers = async () => {
    try {
      const data = await apiFetch("/customers");
      setCustomers(data.items || []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    return customers.filter((item) => {
      const text =
        `${item.name || ""} ${item.phone || ""} ${item.wanted_condition || ""} ${item.memo || ""}`.toLowerCase();

      const matchesSearch = text.includes(search.toLowerCase());
      const matchesContract =
        contractFilter === "전체" || item.contract_status === contractFilter;
      const matchesPriority =
        priorityFilter === "전체" || item.priority === priorityFilter;
      const matchesMeeting =
        meetingFilter === "전체" || item.meeting_status === meetingFilter;

      return (
        matchesSearch &&
        matchesContract &&
        matchesPriority &&
        matchesMeeting
      );
    });
  }, [customers, search, contractFilter, priorityFilter, meetingFilter]);

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
      ? `/customers/${editingId}`
      : "/customers";

    const method = editingId ? "PUT" : "POST";

    try {
      const data = await apiFetch(url, {
        method,
        body: JSON.stringify(form),
      });

      if (!data.success) {
        alert(data.message || "저장에 실패했습니다.");
        return;
      }

      resetForm();
      fetchCustomers();
    } catch (error) {
      console.error(error);
      alert(error.message || "고객 저장 중 오류가 발생했습니다.");
    }
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
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;

    try {
      const data = await apiFetch(`/customers/${id}`, {
        method: "DELETE",
      });

      if (!data.success) {
        alert(data.message || "삭제에 실패했습니다.");
        return;
      }

      fetchCustomers();
      if (editingId === id) resetForm();
    } catch (error) {
      console.error(error);
      alert(error.message || "삭제 중 오류가 발생했습니다.");
    }
  };

  return (
    <PageShell page="customers" setPage={setPage}>
      <div className="page-header">
        <p className="page-badge">고객 관리</p>
        <h1>고객 관리</h1>
        <p className="page-desc">
          고객 정보를 등록하고 검색하고 수정할 수 있습니다.
        </p>
      </div>

      <div className="customer-grid">
        <section className="panel">
          <div className="panel-head">
            <h3>{editingId ? "고객 정보 수정" : "고객 등록"}</h3>
            <p>연락처, 찾는 조건, 계약 여부, 중요도를 기록합니다.</p>
          </div>

          <form className="form-box" onSubmit={handleSubmit}>
            <div className="field-grid two">
              <div className="field">
                <label>고객명</label>
                <input
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="예: 김은수"
                  required
                />
              </div>

              <div className="field">
                <label>연락처</label>
                <input
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="예: 010-1234-5678"
                />
              </div>
            </div>

            <div className="field">
              <label>찾는 조건</label>
              <textarea
                rows="4"
                value={form.wanted_condition}
                onChange={(e) =>
                  updateField("wanted_condition", e.target.value)
                }
                placeholder="예: 강남, 오피스텔, 월세 1000/80 이하"
              />
            </div>

            <div className="field-grid three">
              <div className="field">
                <label>계약 여부</label>
                <select
                  value={form.contract_status}
                  onChange={(e) =>
                    updateField("contract_status", e.target.value)
                  }
                >
                  <option value="미계약">미계약</option>
                  <option value="진행중">진행중</option>
                  <option value="계약완료">계약완료</option>
                </select>
              </div>

              <div className="field">
                <label>중요도</label>
                <select
                  value={form.priority}
                  onChange={(e) => updateField("priority", e.target.value)}
                >
                  <option value="낮음">낮음</option>
                  <option value="보통">보통</option>
                  <option value="높음">높음</option>
                </select>
              </div>

              <div className="field">
                <label>미팅 여부</label>
                <select
                  value={form.meeting_status}
                  onChange={(e) =>
                    updateField("meeting_status", e.target.value)
                  }
                >
                  <option value="미팅 전">미팅 전</option>
                  <option value="미팅 예정">미팅 예정</option>
                  <option value="미팅 완료">미팅 완료</option>
                </select>
              </div>
            </div>

            <div className="field">
              <label>메모</label>
              <textarea
                rows="5"
                value={form.memo}
                onChange={(e) => updateField("memo", e.target.value)}
                placeholder="예: 반려동물 가능 여부 중요, 역세권 선호"
              />
            </div>

            <div className="result-action-row">
              <button className="cta-btn" type="submit">
                {editingId ? "수정 저장" : "고객 등록"}
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
            <h3>고객 목록</h3>
            <p>검색과 필터로 고객을 빠르게 찾을 수 있습니다.</p>
          </div>

          <div className="field-grid two filter-grid">
            <div className="field">
              <label>검색</label>
              <input
                placeholder="이름, 연락처, 조건, 메모"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="field">
              <label>계약 여부</label>
              <select
                value={contractFilter}
                onChange={(e) => setContractFilter(e.target.value)}
              >
                <option value="전체">전체</option>
                <option value="미계약">미계약</option>
                <option value="진행중">진행중</option>
                <option value="계약완료">계약완료</option>
              </select>
            </div>

            <div className="field">
              <label>중요도</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option value="전체">전체</option>
                <option value="낮음">낮음</option>
                <option value="보통">보통</option>
                <option value="높음">높음</option>
              </select>
            </div>

            <div className="field">
              <label>미팅 여부</label>
              <select
                value={meetingFilter}
                onChange={(e) => setMeetingFilter(e.target.value)}
              >
                <option value="전체">전체</option>
                <option value="미팅 전">미팅 전</option>
                <option value="미팅 예정">미팅 예정</option>
                <option value="미팅 완료">미팅 완료</option>
              </select>
            </div>
          </div>

          <div className="customer-list">
            {filteredCustomers.length === 0 ? (
              <div className="empty-box">조건에 맞는 고객이 없습니다.</div>
            ) : (
              filteredCustomers.map((item) => (
                <div className="customer-item" key={item.id}>
                  <div className="customer-main">
                    <div className="customer-top">
                      <strong>{item.name}</strong>
                      <div className="mini-badges">
                        <span>{item.contract_status}</span>
                        <span>{item.priority}</span>
                        <span>{item.meeting_status}</span>
                      </div>
                    </div>

                    <div className="customer-sub">
                      {item.phone || "연락처 없음"}
                    </div>
                    <div className="customer-desc">
                      {item.wanted_condition || "조건 없음"}
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

export default CustomersPage;
