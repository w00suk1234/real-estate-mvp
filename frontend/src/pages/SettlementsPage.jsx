import { useEffect, useMemo, useState } from "react";
import { deleteSettlement, listCustomers, listSettlements, saveCustomer, saveSettlement } from "../services/supabaseRepository";

const DEFAULT_FORM = {
  id: "",
  customer_id: "",
  customer_name: "",
  phone: "",
  settlement_date: "",
  tenant_fee: "",
  landlord_fee: "",
  status: "정산대기",
  memo: "",
};

function numberValue(value) {
  const parsed = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value) {
  return numberValue(value).toLocaleString("ko-KR") + "원";
}

function SettlementsPage() {
  const [settlements, setSettlements] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [customerSearch, setCustomerSearch] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const totalFee = numberValue(form.tenant_fee) + numberValue(form.landlord_fee);
  const completedRevenue = useMemo(() => settlements.filter((item) => item.status === "정산완료").reduce((sum, item) => sum + numberValue(item.total_fee || numberValue(item.tenant_fee) + numberValue(item.landlord_fee)), 0), [settlements]);
  const waitingSettlements = settlements.filter((item) => item.status !== "정산완료");
  const completedSettlements = settlements.filter((item) => item.status === "정산완료");
  const selectedCustomer = customers.find((customer) => customer.id === form.customer_id);
  const filteredCustomers = customers
    .filter((customer) => {
      const keyword = customerSearch.trim().toLowerCase();
      if (!keyword) return true;
      return [customer.name, customer.phone, customer.preferred_area].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword));
    })
    .slice(0, 8);

  const loadData = async () => {
    const [settlementRows, customerRows] = await Promise.all([listSettlements(), listCustomers()]);
    setSettlements(settlementRows);
    setCustomers(customerRows);
  };

  useEffect(() => {
    loadData().catch((error) => setMessage(error.message));
  }, []);

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectCustomer = (customer) => {
    setForm((prev) => ({
      ...prev,
      customer_id: customer.id,
      customer_name: customer.name || "",
      phone: customer.phone || "",
      memo: prev.memo || customer.memo || "",
    }));
    setCustomerSearch(customer.name || "");
  };

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setCustomerSearch("");
  };

  const editSettlement = (item) => {
    setForm({
      id: item.id || "",
      customer_id: item.customer_id || "",
      customer_name: item.customer_name || "",
      phone: item.phone || "",
      settlement_date: item.settlement_date || "",
      tenant_fee: item.tenant_fee ? String(item.tenant_fee) : "",
      landlord_fee: item.landlord_fee ? String(item.landlord_fee) : "",
      status: item.status || "정산대기",
      memo: item.memo || "",
    });
    setCustomerSearch(item.customer_name || "");
  };

  const persistSettlement = async (statusOverride) => {
    if (!form.customer_name.trim()) {
      setMessage("고객명을 선택하거나 입력해 주세요.");
      return null;
    }

    const payload = {
      ...form,
      customer_name: form.customer_name.trim(),
      phone: form.phone.trim(),
      tenant_fee: numberValue(form.tenant_fee),
      landlord_fee: numberValue(form.landlord_fee),
      total_fee: totalFee,
      status: statusOverride || form.status,
      memo: form.memo.trim(),
    };
    return saveSettlement(payload);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await persistSettlement();
      await loadData();
      resetForm();
      setMessage("정산 정보가 저장되었습니다.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const completeSettlement = async (item) => {
    setSaving(true);
    setMessage("");
    try {
      const completed = await saveSettlement({
        ...item,
        tenant_fee: numberValue(item.tenant_fee),
        landlord_fee: numberValue(item.landlord_fee),
        total_fee: numberValue(item.total_fee || numberValue(item.tenant_fee) + numberValue(item.landlord_fee)),
        status: "정산완료",
      });

      if (completed.customer_id) {
        const customer = customers.find((row) => row.id === completed.customer_id);
        if (customer) {
          await saveCustomer({ ...customer, contract_status: "정산완료" });
        }
      }

      await loadData();
      setMessage("정산 완료 처리했습니다.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm("정산 정보를 삭제할까요?");
    if (!confirmed) return;
    await deleteSettlement(id);
    await loadData();
  };

  const renderSettlementItem = (item) => (
    <article key={item.id} className={"settlement-item " + (item.status === "정산완료" ? "is-complete" : "")}>
      <div>
        <strong>{item.customer_name || "고객명 없음"}</strong>
        <span>{item.phone || "연락처 없음"}</span>
      </div>
      <div className="settlement-fee-grid">
        <span>임차인 {formatMoney(item.tenant_fee)}</span>
        <span>임대인 {formatMoney(item.landlord_fee)}</span>
        <strong>합계 {formatMoney(item.total_fee || numberValue(item.tenant_fee) + numberValue(item.landlord_fee))}</strong>
      </div>
      <p>{item.memo || item.settlement_date || "메모 없음"}</p>
      <div className="inline-actions">
        <button type="button" className="secondary-button" onClick={() => editSettlement(item)}>수정</button>
        {item.status !== "정산완료" ? <button type="button" className="primary-button" onClick={() => completeSettlement(item)} disabled={saving}>정산완료</button> : null}
        <button type="button" className="danger-button" onClick={() => handleDelete(item.id)}>삭제</button>
      </div>
    </article>
  );

  return (
    <div className="page-content page-content-wide">
      <div className="page-header compact-page-header">
        <div>
          <span className="eyebrow">매출 관리</span>
          <h1>정산</h1>
          <p>잔금날 일정에서 넘어온 고객의 임차인·임대인 수수료를 따로 관리합니다.</p>
        </div>
      </div>

      <div className="settlement-summary-grid">
        <div className="state-card"><span>정산 대기</span><strong>{waitingSettlements.length}건</strong></div>
        <div className="state-card"><span>정산 완료</span><strong>{completedSettlements.length}건</strong></div>
        <div className="state-card"><span>정산완료 매출</span><strong>{formatMoney(completedRevenue)}</strong></div>
      </div>

      <div className="settlement-layout">
        <section className="settlement-list">
          <h2>정산 목록</h2>
          {settlements.length ? settlements.map(renderSettlementItem) : <div className="empty-state">아직 정산 항목이 없습니다. 잔금날 일정에서 고객을 선택하면 자동으로 생성됩니다.</div>}
        </section>

        <section className="settlement-form-card">
          <h2>정산 추가</h2>
          <form onSubmit={handleSubmit}>
            <label>
              고객명
              <input value={customerSearch} onChange={(event) => { setCustomerSearch(event.target.value); updateForm("customer_name", event.target.value); }} placeholder="고객명을 검색하세요" />
            </label>
            <div className="settlement-customer-picker">
              {filteredCustomers.map((customer) => (
                <button type="button" key={customer.id} onClick={() => selectCustomer(customer)}>
                  <strong>{customer.name || "이름 없음"}</strong>
                  <span>{customer.phone || "연락처 없음"}</span>
                </button>
              ))}
            </div>

            {selectedCustomer ? (
              <div className="settlement-detail-card">
                <strong>{selectedCustomer.name}</strong>
                <span>{selectedCustomer.phone || "연락처 없음"}</span>
                <span>{selectedCustomer.preferred_area || "희망지역 없음"} · {selectedCustomer.property_type || "매물종류 없음"}</span>
              </div>
            ) : null}

            <label>연락처<input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="010-0000-0000" /></label>
            <label>정산일<input type="date" value={form.settlement_date} onChange={(event) => updateForm("settlement_date", event.target.value)} /></label>
            <div className="settlement-fee-grid">
              <label>임차인 수수료<input value={form.tenant_fee} onChange={(event) => updateForm("tenant_fee", event.target.value)} placeholder="예: 500000" /></label>
              <label>임대인 수수료<input value={form.landlord_fee} onChange={(event) => updateForm("landlord_fee", event.target.value)} placeholder="예: 500000" /></label>
            </div>
            <div className="settlement-total-box">정산 합계 <strong>{formatMoney(totalFee)}</strong></div>
            <label>메모<textarea value={form.memo} onChange={(event) => updateForm("memo", event.target.value)} placeholder="정산 메모를 입력하세요." /></label>
            {message ? <p className="form-message">{message}</p> : null}
            <div className="inline-actions">
              <button type="submit" className="primary-button" disabled={saving}>{saving ? "저장 중" : "정산 저장"}</button>
              <button type="button" className="secondary-button" onClick={resetForm}>초기화</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

export default SettlementsPage;
