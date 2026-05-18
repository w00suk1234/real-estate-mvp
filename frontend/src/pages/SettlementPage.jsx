import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { completeSettlement, deleteSettlement, listCustomers, listSchedules, listSettlements, saveCustomer, saveSettlement } from "../services/supabaseRepository";
import { buildScheduleSettlementEntries, formatDaysUntil, getUpcomingSettlements } from "../utils/settlementAlerts";

const CONTRACT_STATUSES = new Set(["계약금입금", "계약서일정", "잔금완료", "정산완료"]);
const CONTRACT_SCHEDULE_TYPES = new Set(["계약금입금", "계약서일정", "계약서작성", "잔금일", "잔금", "잔금날"]);
const DONE_STATUS = "정산완료";
const WAITING_STATUS = "정산대기";
const today = new Date();

function toMonthInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value || "").replace(/[^0-9.-]/g, "");
  return Number(cleaned) || 0;
}

function formatWon(value) {
  return `${new Intl.NumberFormat("ko-KR").format(parseMoney(value))}원`;
}

function formatMonthLabel(monthValue) {
  if (!monthValue) return "전체";
  const [year, month] = String(monthValue).split("-");
  return `${Number(year)}년 ${Number(month)}월`;
}

function formatMoneyInput(value) {
  const amount = parseMoney(value);
  return amount ? new Intl.NumberFormat("ko-KR").format(amount) : "";
}

function sumBy(items, getter) {
  return items.reduce((total, item) => total + parseMoney(getter(item)), 0);
}

function isSameMonth(dateString, monthValue) {
  return Boolean(monthValue) && String(dateString || "").startsWith(monthValue);
}

function getEntryDate(entry) {
  return entry.balance_date || entry.date || String(entry.created_at || "").slice(0, 10);
}

function getSourceLabel(source) {
  return source === "잔금일정" ? "잔금일정 자동생성" : "수동등록";
}

function isContractStatus(status) {
  return CONTRACT_STATUSES.has(String(status || ""));
}

function isContractScheduleType(type) {
  return CONTRACT_SCHEDULE_TYPES.has(String(type || ""));
}

function getCustomerPeriodDate(customer) {
  return (
    customer?.contract_date ||
    customer?.contractDate ||
    customer?.balance_date ||
    customer?.balanceDate ||
    customer?.inflow_date ||
    customer?.inquiry_date ||
    customer?.created_at ||
    ""
  );
}

function getCustomerKey(...values) {
  const key = values.find((value) => String(value || "").trim());
  return key ? String(key).trim() : "";
}

function getSortDate(entry) {
  return new Date(getEntryDate(entry) || entry.created_at || 0).getTime() || 0;
}

function getCustomerValue(customer, snakeKey, camelKey) {
  return customer?.[snakeKey] ?? customer?.[camelKey] ?? "";
}

function feeTotal(entry) {
  const tenant = parseMoney(entry.tenant_fee);
  const landlord = parseMoney(entry.landlord_fee);
  const splitTotal = tenant + landlord;
  return splitTotal || parseMoney(entry.total_fee ?? entry.commission_amount);
}

function normalizeEntry(entry) {
  const tenantFee = parseMoney(entry.tenant_fee);
  const landlordFee = parseMoney(entry.landlord_fee);
  const total = tenantFee + landlordFee || parseMoney(entry.commission_amount);

  return {
    id: entry.id || "",
    customer_id: entry.customer_id || entry.linked_customer_id || "",
    customer_name: entry.customer_name || "",
    customer_phone: entry.customer_phone || entry.phone || "",
    phone: entry.phone || entry.customer_phone || "",
    property_type: entry.property_type || "",
    contract_status: entry.contract_status || "",
    schedule_id: entry.schedule_id || "",
    schedule_title: entry.schedule_title || entry.title || "",
    balance_date: entry.balance_date || entry.date || toDateValue(today),
    date: entry.date || entry.balance_date || toDateValue(today),
    title: entry.title || entry.schedule_title || "정산 대기",
    tenant_fee: tenantFee,
    landlord_fee: landlordFee,
    commission_amount: total,
    total_fee: total,
    expected_amount: parseMoney(entry.expected_amount) || total,
    status: entry.status === DONE_STATUS ? DONE_STATUS : WAITING_STATUS,
    memo: entry.memo || "",
    source: entry.source || "수동등록",
    is_schedule_projection: Boolean(entry.is_schedule_projection),
    created_at: entry.created_at || new Date().toISOString(),
    updated_at: entry.updated_at || new Date().toISOString(),
  };
}

function emptyForm(monthValue) {
  return {
    id: "",
    customer_id: "",
    customer_name: "",
    phone: "",
    property_type: "",
    contract_status: "",
    schedule_id: "",
    schedule_title: "",
    balance_date: `${monthValue || toMonthInputValue(today)}-${String(today.getDate()).padStart(2, "0")}`,
    title: "",
    tenant_fee: "",
    landlord_fee: "",
    memo: "",
    source: "수동등록",
  };
}

function entryToForm(entry) {
  return {
    id: entry.is_schedule_projection ? "" : entry.id || "",
    customer_id: entry.customer_id || "",
    customer_name: entry.customer_name || "",
    customer_phone: entry.customer_phone || entry.phone || "",
    phone: entry.phone || entry.customer_phone || "",
    property_type: entry.property_type || "",
    contract_status: entry.contract_status || "",
    schedule_id: entry.schedule_id || "",
    schedule_title: entry.schedule_title || "",
    balance_date: entry.balance_date || entry.date || toDateValue(today),
    title: entry.title || entry.schedule_title || "",
    tenant_fee: formatMoneyInput(entry.tenant_fee),
    landlord_fee: formatMoneyInput(entry.landlord_fee),
    memo: entry.memo || "",
    source: entry.source || "수동등록",
  };
}

function customerLabel(customer) {
  const name = getCustomerValue(customer, "name", "name") || "이름 없음";
  const phone = getCustomerValue(customer, "phone", "phone");
  const type = getCustomerValue(customer, "property_type", "propertyType");
  return [name, phone, type].filter(Boolean).join(" · ");
}

function buildEntryFromCustomer(customer, monthValue) {
  const customerName = getCustomerValue(customer, "name", "name") || "";
  return normalizeEntry({
    customer_id: customer.id || "",
    customer_name: customerName,
    phone: getCustomerValue(customer, "phone", "phone"),
    property_type: getCustomerValue(customer, "property_type", "propertyType") || "사무실",
    contract_status: getCustomerValue(customer, "contract_status", "contractStatus"),
    balance_date: `${monthValue}-${String(today.getDate()).padStart(2, "0")}`,
    date: `${monthValue}-${String(today.getDate()).padStart(2, "0")}`,
    title: `${customerName || "고객"} 정산`,
    source: "수동등록",
  });
}

function SettlementPage({ setPage } = {}) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [month, setMonth] = useState(toMonthInputValue(today));
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [form, setForm] = useState(() => emptyForm(toMonthInputValue(today)));
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [sourceFilter, setSourceFilter] = useState("전체");
  const [sortMode, setSortMode] = useState("waiting-first");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setCustomers([]);
      setSchedules([]);
      setLedger([]);
      setMessage("");
      return;
    }

    async function load() {
      try {
        const [customerResult, scheduleResult, settlementResult] = await Promise.allSettled([
          listCustomers(),
          listSchedules(),
          listSettlements(),
        ]);
        if (customerResult.status === "rejected") throw customerResult.reason;
        if (scheduleResult.status === "rejected") throw scheduleResult.reason;

        const safeCustomers = Array.isArray(customerResult.value) ? customerResult.value : [];
        const safeSchedules = Array.isArray(scheduleResult.value) ? scheduleResult.value : [];
        const safeSettlements = settlementResult.status === "fulfilled" && Array.isArray(settlementResult.value)
          ? settlementResult.value
          : [];
        const settlementEntries = safeSettlements.map(normalizeEntry);
        const scheduleEntries = buildScheduleSettlementEntries(safeSchedules, safeCustomers, settlementEntries).map(normalizeEntry);

        setCustomers(safeCustomers);
        setSchedules(safeSchedules);
        setLedger([...scheduleEntries, ...settlementEntries]);
        if (settlementResult.status === "rejected") {
          setMessage("정산 DB 테이블이 아직 없어 잔금일정 기준 예정 항목만 표시합니다. 정산 저장은 테이블 생성 후 가능합니다.");
        } else {
          setMessage("");
        }
      } catch (error) {
        setMessage(error.message || "정산 데이터를 불러오지 못했습니다.");
      }
    }

    load();
  }, [authLoading, isAuthenticated, user?.id]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => String(customer.id) === String(form.customer_id)),
    [customers, form.customer_id],
  );

  const periodLedger = useMemo(
    () => (showAllMonths ? ledger : ledger.filter((item) => isSameMonth(getEntryDate(item), month))),
    [ledger, month, showAllMonths],
  );

  const filteredLedger = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const rows = periodLedger.filter((entry) => {
      const searchable = [
        entry.customer_name,
        entry.title,
        entry.schedule_title,
        entry.phone,
        entry.customer_phone,
        entry.memo,
        entry.property_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const statusOk = statusFilter === "전체" || entry.status === statusFilter;
      const sourceOk =
        sourceFilter === "전체" ||
        (sourceFilter === "잔금일정" ? entry.source === "잔금일정" : entry.source !== "잔금일정");
      return (!keyword || searchable.includes(keyword)) && statusOk && sourceOk;
    });

    return [...rows].sort((a, b) => {
      if (sortMode === "amount-desc") return feeTotal(b) - feeTotal(a);
      if (sortMode === "date-desc") return getSortDate(b) - getSortDate(a);
      const statusRank = (entry) => (entry.status === DONE_STATUS ? 1 : 0);
      return statusRank(a) - statusRank(b) || getSortDate(b) - getSortDate(a);
    });
  }, [periodLedger, searchTerm, sortMode, sourceFilter, statusFilter]);

  const stats = useMemo(() => {
    const isInPeriod = (dateString) => showAllMonths || isSameMonth(dateString, month);
    const customerInflow = customers.filter((customer) => isInPeriod(customer.inflow_date || customer.inquiry_date || customer.created_at)).length;
    const scheduleInflow = schedules.filter((schedule) => isInPeriod(schedule.schedule_date) && schedule.schedule_type === "고객인입").length;
    const contractCustomerKeys = new Set();

    customers.forEach((customer) => {
      if (isContractStatus(customer.contract_status) && isInPeriod(getCustomerPeriodDate(customer))) {
        const key = getCustomerKey(customer.id, customer.name, customer.phone);
        if (key) contractCustomerKeys.add(key);
      }
    });

    schedules.forEach((schedule) => {
      if (isInPeriod(schedule.schedule_date) && isContractScheduleType(schedule.schedule_type)) {
        const key = getCustomerKey(schedule.customer_id, schedule.linked_customer_id, schedule.customer_name, schedule.title);
        if (key) contractCustomerKeys.add(key);
      }
    });

    periodLedger.forEach((entry) => {
      const key = getCustomerKey(entry.customer_id, entry.customer_name, entry.phone);
      if (key) contractCustomerKeys.add(key);
    });

    const contractCount = contractCustomerKeys.size;
    const doneRows = periodLedger.filter((item) => item.status === DONE_STATUS);
    const pendingRows = periodLedger.filter((item) => item.status !== DONE_STATUS);

    return {
      inflowCount: Math.max(customerInflow, scheduleInflow),
      contractCount,
      pendingCount: pendingRows.length,
      doneCount: doneRows.length,
      totalCount: periodLedger.length,
      confirmedRevenue: sumBy(doneRows, feeTotal),
      pendingRevenue: sumBy(pendingRows, feeTotal),
      expectedRevenue: sumBy(periodLedger, feeTotal),
    };
  }, [customers, month, periodLedger, schedules, showAllMonths]);

  const upcomingSettlements = useMemo(
    () => getUpcomingSettlements(ledger, { days: 7, limit: 5 }),
    [ledger],
  );

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleMonthChange = (value) => {
    setMonth(value);
    setShowAllMonths(false);
    setForm((prev) => ({ ...prev, balance_date: `${value}-${String(today.getDate()).padStart(2, "0")}` }));
  };

  const moveMonth = (offset) => {
    const [year, monthNumber] = String(month || toMonthInputValue(today)).split("-").map(Number);
    const base = Number.isFinite(year) && Number.isFinite(monthNumber)
      ? new Date(year, monthNumber - 1 + offset, 1)
      : new Date(today.getFullYear(), today.getMonth() + offset, 1);
    handleMonthChange(toMonthInputValue(base));
  };

  const showCurrentMonth = () => {
    const currentMonth = toMonthInputValue(today);
    setMonth(currentMonth);
    setShowAllMonths(false);
    setForm((prev) => ({ ...prev, balance_date: `${currentMonth}-${String(today.getDate()).padStart(2, "0")}` }));
  };

  const resetForm = () => {
    setForm(emptyForm(month));
  };

  const focusSettlementForm = () => {
    resetForm();
    requestAnimationFrame(() => {
      const formNode = document.getElementById("settlement-form-card");
      formNode?.scrollIntoView({ behavior: "smooth", block: "start" });
      formNode?.querySelector("select, input, textarea")?.focus();
    });
  };

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("전체");
    setSourceFilter("전체");
    setSortMode("waiting-first");
  };

  const goToSchedules = () => {
    if (typeof setPage === "function") setPage("schedules");
  };

  const handleCustomerSelect = (customerId) => {
    if (!customerId) {
      resetForm();
      return;
    }

    const customer = customers.find((row) => String(row.id) === String(customerId));
    const existing = ledger.find((entry) => String(entry.customer_id || "") === String(customerId));
    const entry = existing || buildEntryFromCustomer(customer, month);
    setForm(entryToForm(entry));
  };

  const buildFormEntry = (status = WAITING_STATUS) => {
    const tenantFee = parseMoney(form.tenant_fee);
    const landlordFee = parseMoney(form.landlord_fee);
    const total = tenantFee + landlordFee;
    const customerName = form.customer_name.trim() || getCustomerValue(selectedCustomer, "name", "name") || "고객";

    return normalizeEntry({
      ...form,
      customer_name: customerName,
      phone: form.phone || getCustomerValue(selectedCustomer, "phone", "phone"),
      property_type: form.property_type || getCustomerValue(selectedCustomer, "property_type", "propertyType") || "사무실",
      contract_status: form.contract_status || getCustomerValue(selectedCustomer, "contract_status", "contractStatus"),
      date: form.balance_date,
      balance_date: form.balance_date,
      title: form.title.trim() || `${customerName} 정산`,
      tenant_fee: tenantFee,
      landlord_fee: landlordFee,
      commission_amount: total,
      total_fee: total,
      expected_amount: total,
      status,
    });
  };

  const upsertEntry = async (entry) => {
    const saved = normalizeEntry(await saveSettlement(entry));
    setLedger((prev) => {
      const index = prev.findIndex((item) => {
        if (saved.id && item.id === saved.id) return true;
        if (saved.schedule_id && item.schedule_id === saved.schedule_id) return true;
        if (saved.customer_id && item.customer_id === saved.customer_id && getEntryDate(saved) === getEntryDate(item)) return true;
        return false;
      });
      if (index < 0) return [saved, ...prev];
      return prev.map((item, itemIndex) => (itemIndex === index ? saved : item));
    });
    return saved;
  };
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const entry = buildFormEntry();
      await upsertEntry(entry);
      setMessage("정산 정보가 저장되었습니다.");
      resetForm();
    } catch (error) {
      setMessage(error.message || "정산 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };
  const handleEdit = (entry) => {
    setForm(entryToForm(entry));
    setMessage(
      entry.is_schedule_projection
        ? "잔금일정을 기준으로 정산 입력 영역에 불러왔습니다. 수수료 입력 후 정산 저장을 눌러 실제 정산 항목으로 등록해 주세요."
        : "정산 수정 영역에 선택한 내역을 불러왔습니다.",
    );
  };

  const handleDelete = async (id) => {
    try {
      await deleteSettlement(id);
      setLedger((prev) => prev.filter((entry) => entry.id !== id));
      if (form.id === id) resetForm();
      setMessage("정산 항목을 삭제했습니다.");
    } catch (error) {
      setMessage(error.message || "정산 항목 삭제 중 오류가 발생했습니다.");
    }
  };
  const handleComplete = async (entry) => {
    if (entry.is_schedule_projection) {
      setMessage("잔금일정 기반 항목은 먼저 정산 저장을 눌러 실제 정산 항목으로 등록해 주세요.");
      return;
    }
    if (entry.status === DONE_STATUS || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const completedEntry = normalizeEntry(await completeSettlement(entry.id));
      setLedger((prev) => prev.map((item) => (item.id === completedEntry.id ? completedEntry : item)));
      if (entry.customer_id) {
        const customer = customers.find((item) => String(item.id) === String(entry.customer_id));
        if (customer) {
          const updated = await saveCustomer({ ...customer, contract_status: DONE_STATUS });
          setCustomers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        }
      }
      setMessage("정산완료 처리했습니다.");
    } catch (error) {
      setMessage(error.message || "정산완료 처리 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };
  const formTotal = parseMoney(form.tenant_fee) + parseMoney(form.landlord_fee);

  return (
    <div className="page-stack settlement-page">
      <section className="page-header-card compact-page-header settlement-header">
        <div>
          <h1>수수료 정산</h1>
          <p>잔금 일정과 고객 정보를 기준으로 임차인·임대인 수수료를 관리합니다.</p>
        </div>
        <div className="settlement-month-controls" aria-label="정산 조회 기간">
          <input className="month-input settlement-month-input" type="month" value={month} onChange={(event) => handleMonthChange(event.target.value)} />
          <button type="button" className={`settlement-period-btn ${!showAllMonths && month === toMonthInputValue(today) ? "active" : ""}`} onClick={showCurrentMonth}>
            이번 달
          </button>
          <button type="button" className={`settlement-period-btn ${showAllMonths ? "active" : ""}`} onClick={() => setShowAllMonths(true)}>
            전체보기
          </button>
        </div>
      </section>

      <section className="settlement-stat-grid">
        <StatCard label={showAllMonths ? "전체 총 정산" : `${formatMonthLabel(month)} 총 정산`} value={formatWon(stats.expectedRevenue)} tone="expected" />
        <StatCard label="정산 완료" value={formatWon(stats.confirmedRevenue)} tone="balance" />
        <StatCard label="미정산" value={formatWon(stats.pendingRevenue)} tone="meeting" />
        <StatCard label="건수" value={`${stats.totalCount}건`} tone="contract" />
        <StatCard label="손님 인입" value={`${stats.inflowCount}건`} tone="inflow" />
      </section>

      <section className="settlement-upcoming-card">
        <div className="section-heading-row">
          <div>
            <h2>1주일 내 정산 예정</h2>
            <p>정산일이 가까운 미정산 항목을 최대 5건까지 먼저 보여줍니다.</p>
          </div>
          <span>{upcomingSettlements.length ? `${upcomingSettlements.length}건` : "예정 없음"}</span>
        </div>
        {upcomingSettlements.length ? (
          <div className="settlement-upcoming-list">
            {upcomingSettlements.map((entry) => (
              <article key={entry.id || `${entry.customer_name}-${entry.upcomingDate}`} className="settlement-upcoming-item">
                <div>
                  <strong>{entry.customer_name || entry.title || "고객명 미입력"}</strong>
                  <p>{[entry.title, getSourceLabel(entry.source), entry.property_type].filter(Boolean).join(" · ") || "연결 정보 없음"}</p>
                </div>
                <em>{formatDaysUntil(entry.daysLeft)}</em>
                <span>{entry.upcomingDate}</span>
                <b>{formatWon(feeTotal(entry))}</b>
              </article>
            ))}
          </div>
        ) : (
          <div className="settlement-upcoming-empty">오늘부터 7일 이내에 처리할 정산 예정 항목이 없습니다.</div>
        )}
      </section>

      <section className="settlement-layout">
        <div className="settlement-table-card">
          <div className="section-heading-row settlement-list-heading">
            <div>
              <h2>{showAllMonths ? "전체 정산목록" : `${formatMonthLabel(month)} 정산목록`}</h2>
              <p>{periodLedger.length}건 중 {filteredLedger.length}건을 표시합니다. 고객관리 정보와 잔금일정을 기준으로 월별 정산 대기를 보여줍니다.</p>
            </div>
            <button type="button" className="primary-btn settlement-add-trigger" onClick={focusSettlementForm}>
              + 정산 추가
            </button>
          </div>

          <div className="settlement-list-period-bar">
            <div className="settlement-list-calendar" aria-label="정산 목록 월 선택">
              <span>정산월</span>
              <button type="button" className="secondary-btn small-btn" onClick={() => moveMonth(-1)}>
                이전
              </button>
              <input className="month-input settlement-month-input" type="month" value={month} onChange={(event) => handleMonthChange(event.target.value)} />
              <button type="button" className="secondary-btn small-btn" onClick={() => moveMonth(1)}>
                다음
              </button>
            </div>
            <div className="inline-actions settlement-list-quick-actions">
              <button type="button" className={`settlement-period-btn ${!showAllMonths && month === toMonthInputValue(today) ? "active" : ""}`} onClick={showCurrentMonth}>
                이번 달
              </button>
              <button type="button" className={`settlement-period-btn ${showAllMonths ? "active" : ""}`} onClick={() => setShowAllMonths(true)}>
                전체보기
              </button>
            </div>
          </div>

          <div className="settlement-toolbar">
            <label className="field">
              <span>검색</span>
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="고객명, 정산명, 연락처, 메모" />
            </label>
            <label className="field">
              <span>상태</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option>전체</option>
                <option>{WAITING_STATUS}</option>
                <option>{DONE_STATUS}</option>
              </select>
            </label>
            <label className="field">
              <span>생성 경로</span>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option>전체</option>
                <option value="잔금일정">잔금일정 자동생성</option>
                <option value="수동등록">수동등록</option>
              </select>
            </label>
            <label className="field">
              <span>정렬</span>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                <option value="waiting-first">정산대기 우선</option>
                <option value="date-desc">잔금일 최신순</option>
                <option value="amount-desc">금액 높은순</option>
              </select>
            </label>
            <button type="button" className="secondary-btn settlement-reset-btn" onClick={resetFilters}>
              초기화
            </button>
          </div>

          <div className="settlement-table">
            {filteredLedger.length ? (
              filteredLedger.map((entry) => (
                <article key={entry.id} className={`settlement-row ${entry.status === DONE_STATUS ? "is-done" : "is-waiting"} ${entry.is_schedule_projection ? "is-projection" : ""}`}>
                  <div className="settlement-row-main">
                    <span>{getEntryDate(entry)} · {getSourceLabel(entry.source)}</span>
                    <strong>{entry.customer_name || entry.title || "고객명 미입력"}</strong>
                    <p>{[entry.title, entry.phone, entry.property_type].filter(Boolean).join(" · ") || "연결 정보 없음"}</p>
                    {entry.memo ? <p className="settlement-memo">{entry.memo}</p> : null}
                  </div>
                  <div className="settlement-row-fees">
                    <span>임차인 {formatWon(entry.tenant_fee)}</span>
                    <span>임대인 {formatWon(entry.landlord_fee)}</span>
                    <strong>합계 {formatWon(feeTotal(entry))}</strong>
                  </div>
                  <em className={`settlement-status ${entry.status === DONE_STATUS ? "done" : "waiting"}`}>{entry.status}</em>
                  <div className="inline-actions settlement-row-actions">
                    <button type="button" className="secondary-btn small-btn" onClick={() => handleEdit(entry)}>
                      {entry.is_schedule_projection ? "정산 입력" : "수정"}
                    </button>
                    {entry.is_schedule_projection ? null : (
                      <button type="button" className="primary-btn small-btn" onClick={() => handleComplete(entry)} disabled={entry.status === DONE_STATUS}>
                        {entry.status === DONE_STATUS ? "완료됨" : "정산완료"}
                      </button>
                    )}
                    {entry.customer_id ? (
                      <button type="button" className="secondary-btn small-btn" onClick={() => typeof setPage === "function" && setPage("customers")} disabled={typeof setPage !== "function"}>
                        고객정보
                      </button>
                    ) : null}
                    {entry.is_schedule_projection ? null : (
                      <button type="button" className="danger-btn small-btn" onClick={() => handleDelete(entry.id)}>
                        삭제
                      </button>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <div className="settlement-empty-state">
                <strong>{periodLedger.length ? "조건에 맞는 정산 내역이 없습니다." : `${showAllMonths ? "전체" : formatMonthLabel(month)} 정산 내역이 없습니다.`}</strong>
                <p>{periodLedger.length ? "검색어 또는 필터를 초기화해 다시 확인해 주세요." : "잔금 일정을 저장하면 고객별 정산 대기 항목이 자동으로 생성됩니다."}</p>
                <div className="inline-actions settlement-empty-actions">
                  <button type="button" className="primary-btn small-btn" onClick={focusSettlementForm}>
                    정산 직접 추가
                  </button>
                  {periodLedger.length ? (
                    <button type="button" className="secondary-btn small-btn" onClick={resetFilters}>
                      필터 초기화
                    </button>
                  ) : typeof setPage === "function" ? (
                    <button type="button" className="secondary-btn small-btn" onClick={goToSchedules}>
                      일정관리로 이동
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>

        <form id="settlement-form-card" className="settlement-form-card" onSubmit={handleSubmit}>
          <div className="section-heading-row">
            <div>
              <h2>{form.id ? "정산 수정" : "정산 추가"}</h2>
              <p>고객을 선택하면 기존 고객정보를 확인한 뒤 수수료를 입력할 수 있습니다.</p>
            </div>
          </div>

          <label className="field">
            <span>고객명</span>
            <select className="settlement-customer-select" value={form.customer_id} onChange={(event) => handleCustomerSelect(event.target.value)}>
              <option value="">고객 직접 입력 또는 선택</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customerLabel(customer)}
                </option>
              ))}
            </select>
          </label>

          {selectedCustomer ? (
            <div className="selected-customer-card">
              <strong>{getCustomerValue(selectedCustomer, "name", "name")}</strong>
              <p>{[getCustomerValue(selectedCustomer, "phone", "phone"), getCustomerValue(selectedCustomer, "property_type", "propertyType"), getCustomerValue(selectedCustomer, "contract_status", "contractStatus")].filter(Boolean).join(" · ")}</p>
              <p>{getCustomerValue(selectedCustomer, "preferred_area", "preferredArea") || getCustomerValue(selectedCustomer, "location", "location") || "희망지역 미입력"}</p>
              <small>{getCustomerValue(selectedCustomer, "memo", "memo") || getCustomerValue(selectedCustomer, "notes", "notes") || "등록된 고객 메모가 없습니다."}</small>
            </div>
          ) : null}

          <div className="field-grid two">
            <label className="field">
              <span>직접 입력 고객명</span>
              <input value={form.customer_name} onChange={(event) => updateForm("customer_name", event.target.value)} placeholder="예: 김고객" />
            </label>
            <label className="field">
              <span>잔금일 / 정산일</span>
              <input type="date" value={form.balance_date} onChange={(event) => updateForm("balance_date", event.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>정산명</span>
            <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="예: 역삼 사무실 잔금 정산" />
          </label>

          <div className="settlement-fee-grid">
            <label className="field">
              <span>임차인 수수료</span>
              <input inputMode="numeric" value={form.tenant_fee} onChange={(event) => updateForm("tenant_fee", formatMoneyInput(event.target.value))} placeholder="예: 1,500,000" />
            </label>
            <label className="field">
              <span>임대인 수수료</span>
              <input inputMode="numeric" value={form.landlord_fee} onChange={(event) => updateForm("landlord_fee", formatMoneyInput(event.target.value))} placeholder="예: 1,500,000" />
            </label>
            <div className="settlement-total-box">
              <span>합계 수수료</span>
              <strong>{formatWon(formTotal)}</strong>
            </div>
          </div>

          <label className="field">
            <span>메모</span>
            <textarea rows="3" value={form.memo} onChange={(event) => updateForm("memo", event.target.value)} placeholder="정산 조건, 지급 예정일 등" />
          </label>

          {message ? <div className="schedule-inline-alert">{message}</div> : null}

          <div className="form-actions inline-actions">
            <button type="submit" className="primary-btn" disabled={saving}>
              {form.id ? "수정 저장" : "정산 저장"}
            </button>
            {form.id ? (
              <button type="button" className="secondary-btn" onClick={resetForm}>
                취소
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}

function StatCard({ label, value, tone }) {
  return (
    <article className={`settlement-stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export default SettlementPage;



