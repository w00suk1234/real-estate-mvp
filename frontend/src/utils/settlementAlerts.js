const DONE_STATUS = "정산완료";
const WAITING_STATUS = "정산대기";
export const BALANCE_SETTLEMENT_TYPES = new Set(["잔금일", "잔금", "잔금날", "잔금일정"]);

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getSettlementDate(entry = {}) {
  return entry.balance_date || entry.date || String(entry.created_at || "").slice(0, 10);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeScheduleType(schedule = {}) {
  return normalizeText(schedule.schedule_type || schedule.type);
}

function getScheduleDate(schedule = {}) {
  return schedule.schedule_date || schedule.date || "";
}

function getScheduleCustomerId(schedule = {}) {
  return schedule.customer_id || schedule.linked_customer_id || "";
}

function getScheduleCustomerName(schedule = {}, customer = {}) {
  const scheduleTitle = normalizeText(schedule.title);
  const scheduleType = normalizeScheduleType(schedule);
  const titleName = scheduleTitle && scheduleType && scheduleTitle.endsWith(scheduleType)
    ? normalizeText(scheduleTitle.slice(0, -scheduleType.length))
    : normalizeText(scheduleTitle.replace(/잔금일정|잔금일|잔금날|잔금|정산/g, ""));

  return (
    normalizeText(customer.name) ||
    normalizeText(schedule.customer_name) ||
    titleName ||
    "고객명 미입력"
  );
}

export function isBalanceSchedule(schedule = {}) {
  const type = normalizeScheduleType(schedule);
  return BALANCE_SETTLEMENT_TYPES.has(type) || /잔금/.test(type);
}

function hasExistingSettlement(settlements, schedule, customerId, balanceDate) {
  const scheduleId = normalizeText(schedule.id);
  return settlements.some((entry) => {
    if (entry.is_schedule_projection) return false;
    if (scheduleId && normalizeText(entry.schedule_id) === scheduleId) return true;

    const entryCustomerId = normalizeText(entry.customer_id || entry.linked_customer_id);
    const sameCustomer = customerId && entryCustomerId === normalizeText(customerId);
    const sameDate = getSettlementDate(entry) === balanceDate;
    const sourceLooksLinked = normalizeText(entry.source).includes("잔금") || !normalizeText(entry.schedule_id);
    return sameCustomer && sameDate && sourceLooksLinked;
  });
}

export function buildScheduleSettlementEntries(schedules = [], customers = [], settlements = []) {
  const customerMap = new Map(
    (Array.isArray(customers) ? customers : [])
      .filter((customer) => customer?.id)
      .map((customer) => [String(customer.id), customer]),
  );

  return (Array.isArray(schedules) ? schedules : [])
    .filter(isBalanceSchedule)
    .map((schedule) => {
      const customerId = getScheduleCustomerId(schedule);
      const customer = customerMap.get(String(customerId)) || {};
      const balanceDate = getScheduleDate(schedule);
      const customerName = getScheduleCustomerName(schedule, customer);

      if (!balanceDate || hasExistingSettlement(settlements, schedule, customerId, balanceDate)) {
        return null;
      }

      return {
        id: `schedule-settlement-${schedule.id || `${balanceDate}-${schedule.title || customerName}`}`,
        is_schedule_projection: true,
        customer_id: customerId,
        customer_name: customerName,
        customer_phone: customer.phone || schedule.customer_phone || "",
        phone: customer.phone || schedule.customer_phone || "",
        property_type: customer.property_type || customer.propertyType || "",
        contract_status: customer.contract_status || customer.contractStatus || "",
        schedule_id: schedule.id || "",
        schedule_title: schedule.title || "잔금 일정",
        balance_date: balanceDate,
        date: balanceDate,
        title: `${customerName} 정산`,
        tenant_fee: 0,
        landlord_fee: 0,
        commission_amount: 0,
        total_fee: 0,
        expected_amount: 0,
        status: WAITING_STATUS,
        memo: schedule.note || schedule.memo || "",
        source: "잔금일정",
        created_at: schedule.created_at || new Date().toISOString(),
        updated_at: schedule.updated_at || schedule.created_at || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

export function parseDateValue(value) {
  const source = String(value || "").slice(0, 10);
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysUntilDate(value, today = new Date()) {
  const date = parseDateValue(value);
  if (!date) return null;
  return Math.round((startOfDay(date).getTime() - startOfDay(today).getTime()) / 86400000);
}

export function formatDaysUntil(days) {
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  return `${days}일 후`;
}

export function getUpcomingSettlements(settlements = [], options = {}) {
  const { today = new Date(), days = 7, limit = 5 } = options;

  return (Array.isArray(settlements) ? settlements : [])
    .map((entry) => {
      const date = getSettlementDate(entry);
      const daysLeft = daysUntilDate(date, today);
      return { ...entry, upcomingDate: date, daysLeft };
    })
    .filter((entry) => entry.status !== DONE_STATUS)
    .filter((entry) => Number.isFinite(entry.daysLeft) && entry.daysLeft >= 0 && entry.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft || String(a.upcomingDate).localeCompare(String(b.upcomingDate)))
    .slice(0, limit);
}
