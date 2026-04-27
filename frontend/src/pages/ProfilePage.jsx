import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const initialForm = {
  office_name: "",
  manager_name: "",
  phone: "",
  email: "",
};

function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setForm({
      office_name: user.office_name || "",
      manager_name: user.manager_name || "",
      phone: user.phone || "",
      email: user.email || "",
    });
  }, [user]);

  const footerItems = useMemo(
    () =>
      [
        { label: "부동산 이름", value: form.office_name },
        { label: "담당자명", value: form.manager_name },
        { label: "연락처", value: form.phone },
        { label: "이메일", value: form.email },
      ].filter((item) => item.value?.trim()),
    [form],
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await updateProfile(form);
      setMessage("내 정보가 저장되었습니다. 이후 생성하는 소개서 하단에 자동으로 반영됩니다.");
    } catch (submitError) {
      setError(submitError.message || "내 정보 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="surface-card">
        <div className="section-kicker">회원정보</div>
        <h1 className="section-title">내 정보 관리</h1>
        <p className="section-copy">
          부동산 이름, 담당자명, 연락처, 이메일은 소개서 하단 연락처 영역에 자동으로 표시됩니다.
        </p>
      </section>

      <div className="profile-grid">
        <section className="surface-card">
          <div className="card-header-row">
            <div>
              <h2 className="card-title">기본 정보 수정</h2>
              <p className="card-copy">회원가입 이후에도 자유롭게 수정할 수 있습니다.</p>
            </div>
          </div>

          <form className="profile-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>부동산 이름</span>
              <input
                name="office_name"
                value={form.office_name}
                onChange={handleChange}
                placeholder="예: 역삼 프라임 공인중개사"
              />
            </label>

            <label className="field">
              <span>담당자명</span>
              <input
                name="manager_name"
                value={form.manager_name}
                onChange={handleChange}
                placeholder="예: 김중개"
              />
            </label>

            <div className="field-grid two">
              <label className="field">
                <span>연락처</span>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="예: 010-1234-5678"
                />
              </label>

              <label className="field">
                <span>이메일</span>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="예: broker@example.com"
                />
              </label>
            </div>

            {message ? <div className="inline-success">{message}</div> : null}
            {error ? <div className="inline-error">{error}</div> : null}

            <div className="form-actions">
              <button type="submit" className="primary-btn" disabled={saving}>
                {saving ? "저장 중..." : "내 정보 저장"}
              </button>
            </div>
          </form>
        </section>

        <aside className="surface-card profile-summary-card">
          <div className="section-kicker">소개서 반영 미리보기</div>
          <h2 className="card-title">하단 연락처 표기</h2>
          <p className="card-copy">비어 있는 항목은 자동으로 숨겨집니다.</p>

          <div className="profile-contact-preview">
            {footerItems.length ? (
              footerItems.map((item) => (
                <div key={item.label} className="profile-contact-row">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))
            ) : (
              <div className="empty-hint">입력한 정보가 아직 없습니다.</div>
            )}
          </div>

          <div className="profile-meta">
            <div>
              <span>가입 아이디</span>
              <strong>{user?.username || "-"}</strong>
            </div>
            <div>
              <span>회원 권한</span>
              <strong>{user?.role === "admin" ? "관리자" : "일반회원"}</strong>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default ProfilePage;
