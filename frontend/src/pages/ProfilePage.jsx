import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const defaultProfile = {
  office_name: "",
  manager_name: "",
  phone: "",
  email: "",
};

function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState(defaultProfile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({
      office_name: user?.office_name || "",
      manager_name: user?.manager_name || user?.agent_name || "",
      phone: user?.phone || user?.contact_phone || "",
      email: user?.email || "",
    });
  }, [user]);

  const footerItems = [
    { label: "부동산 이름", value: form.office_name.trim() },
    { label: "담당자명", value: form.manager_name.trim() },
    { label: "연락처", value: form.phone.trim() },
    { label: "이메일", value: form.email.trim() },
  ].filter((item) => item.value);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await updateProfile({
        office_name: form.office_name.trim(),
        manager_name: form.manager_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
      });
      setMessage("내 정보가 저장되었습니다. 이후 생성하는 소개서 하단에 자동 반영됩니다.");
    } catch (submitError) {
      setError(submitError.message || "내 정보 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-header-card">
        <span className="section-eyebrow">회원정보</span>
        <h1>내 정보 관리</h1>
        <p>부동산 이름, 담당자명, 연락처, 이메일은 소개서 하단 연락처 영역에 자동 표시됩니다.</p>
      </section>

      <section className="profile-grid profile-grid-balanced">
        <form className="panel profile-edit-card" onSubmit={handleSubmit}>
          <div className="section-heading">
            <div>
              <span className="section-eyebrow">기본 정보 수정</span>
              <h2>소개서에 반영될 담당자 정보</h2>
            </div>
          </div>

          <div className="form-grid">
            <label className="field span-2">
              <span>부동산 이름</span>
              <input
                value={form.office_name}
                onChange={(event) => updateField("office_name", event.target.value)}
                placeholder="예: 역삼 프라임 공인중개사"
              />
            </label>

            <label className="field span-2">
              <span>담당자명</span>
              <input
                value={form.manager_name}
                onChange={(event) => updateField("manager_name", event.target.value)}
                placeholder="예: 김중개"
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
              <span>이메일</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="예: broker@example.com"
              />
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? "저장 중..." : "내 정보 저장"}
            </button>
          </div>

          {message ? <p className="form-message">{message}</p> : null}
          {error ? <p className="form-error-message">{error}</p> : null}
        </form>

        <div className="panel profile-preview-card">
          <div className="section-heading">
            <div>
              <span className="section-eyebrow">소개서 반영 미리보기</span>
              <h2>하단 연락처 표기</h2>
            </div>
          </div>

          <div className="profile-preview-block">
            {footerItems.length ? (
              footerItems.map((item) => (
                <div key={item.label} className="profile-preview-row">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))
            ) : (
              <p className="empty-state">
                입력된 정보가 아직 없습니다. 필요한 항목만 입력하면 소개서 하단에 자동 표시됩니다.
              </p>
            )}
          </div>

          <div className="meta-list">
            <div>
              <span>가입 아이디</span>
              <strong>{user?.username || "-"}</strong>
            </div>
            <div>
              <span>회원 권한</span>
              <strong>{user?.role === "admin" ? "관리자" : "일반회원"}</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ProfilePage;
