export const TEAM_OWNER_ROLES = new Set(["owner", "admin"]);
export const TEAM_MEMBER_ROLES = new Set(["owner", "admin", "member", "viewer"]);
export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
export const CONTRACT_STATUSES = new Set(["계약금입금", "계약서일정", "잔금완료", "정산완료", "contracted", "contract_signed"]);
export const TEAM_SCHEDULE_TYPES = [
  { key: "inflow", label: "고객인입", aliases: ["고객인입", "customer_inflow", "inflow", "lead", "고객유입"] },
  { key: "meeting", label: "미팅", aliases: ["미팅", "meeting", "consult", "consultation", "상담"] },
  { key: "contract", label: "계약서작성", aliases: ["계약서작성", "계약서일정", "contract", "contract_write", "contract_sign"] },
  { key: "balance", label: "잔금", aliases: ["잔금", "잔금일", "잔금날", "balance", "final_payment", "payment"] },
];

export function isTeamModeEnabled() {
  return import.meta.env.VITE_TEAM_MODE_ENABLED !== "false";
}

export function isTeamSelfCreateAllowed() {
  return import.meta.env.VITE_TEAM_MODE_ALLOW_SELF_CREATE !== "false";
}

export function getDefaultTrialDays() {
  const value = Number(import.meta.env.VITE_TEAM_MODE_DEFAULT_TRIAL_DAYS || 14);
  return Number.isFinite(value) && value > 0 ? value : 14;
}

export function isSubscriptionActive(subscription) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(String(subscription?.status || ""));
}

export function canManageTeam(membership) {
  return TEAM_OWNER_ROLES.has(String(membership?.role || ""));
}

export function canViewTeamData(membership) {
  return TEAM_MEMBER_ROLES.has(String(membership?.role || "")) && String(membership?.status || "active") === "active";
}

export function getSeatCapacity(subscription, team) {
  if (subscription?.is_unlimited || subscription?.plan_type === "team_unlimited" || team?.plan_type === "team_unlimited") {
    return Infinity;
  }
  const baseLimit = Number(subscription?.seat_limit ?? team?.seat_limit ?? 5) || 5;
  const extraSeats = Number(subscription?.extra_seat_count || 0) || 0;
  return baseLimit + extraSeats;
}

export function getSeatUsage({ members = [], invitations = [] }) {
  const activeMembers = members.filter((member) => ["active", "invited"].includes(String(member.status || "active")));
  const pendingInvitations = invitations.filter((invite) => String(invite.status || "pending") === "pending");
  return activeMembers.length + pendingInvitations.length;
}

export function canInviteSeat({ members = [], invitations = [], subscription, team }) {
  const capacity = getSeatCapacity(subscription, team);
  if (capacity === Infinity) return true;
  return getSeatUsage({ members, invitations }) < capacity;
}

export function getScheduleBucket(type) {
  const normalized = String(type || "").trim();
  const bucket = TEAM_SCHEDULE_TYPES.find((item) => item.aliases.includes(normalized));
  return bucket?.key || "other";
}

export function buildScheduleTypeCounts(schedules = []) {
  const counts = Object.fromEntries(TEAM_SCHEDULE_TYPES.map((item) => [item.key, 0]));
  schedules.forEach((schedule) => {
    const bucket = getScheduleBucket(schedule.schedule_type || schedule.type);
    if (Object.prototype.hasOwnProperty.call(counts, bucket)) counts[bucket] += 1;
  });
  return counts;
}

export function parseMoney(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getSettlementAmount(entry = {}) {
  const tenant = parseMoney(entry.tenant_fee ?? entry.tenantFee);
  const landlord = parseMoney(entry.landlord_fee ?? entry.landlordFee);
  return tenant + landlord || parseMoney(entry.total_fee ?? entry.commission_amount ?? entry.amount);
}

export function getEntryMonth(value) {
  return String(value || "").slice(0, 7);
}

export function isSameMonth(value, month) {
  return Boolean(month) && getEntryMonth(value) === month;
}

export function getCustomerInflowDate(customer = {}) {
  return customer.inflow_date || customer.inquiry_date || customer.created_at || "";
}

export function isContractCustomer(customer = {}) {
  return CONTRACT_STATUSES.has(String(customer.contract_status || customer.status || ""));
}

export function getAssignedUserId(item = {}) {
  return item.assigned_to_user_id || item.assignedToUserId || item.user_id || item.created_by_user_id || "";
}

export function calculatePayrollTotal(statement = {}) {
  return (
    parseMoney(statement.base_pay ?? statement.basePay) +
    parseMoney(statement.commission_pay ?? statement.commissionPay) +
    parseMoney(statement.bonus_pay ?? statement.bonusPay) -
    parseMoney(statement.deduction_amount ?? statement.deductionAmount)
  );
}

export function buildTeamMonthlySummary({ month, members = [], customers = [], schedules = [], settlements = [] }) {
  const monthCustomers = customers.filter((customer) => isSameMonth(getCustomerInflowDate(customer), month));
  const monthContractCustomers = customers.filter((customer) => isContractCustomer(customer) && isSameMonth(getCustomerInflowDate(customer), month));
  const monthSchedules = schedules.filter((schedule) => isSameMonth(schedule.schedule_date || schedule.date, month));
  const monthSettlements = settlements.filter((entry) => isSameMonth(entry.balance_date || entry.date || entry.created_at, month));

  const memberSummaries = members
    .filter((member) => String(member.status || "active") === "active")
    .map((member) => {
      const userId = member.user_id || member.userId;
      const memberCustomers = monthCustomers.filter((customer) => String(getAssignedUserId(customer)) === String(userId));
      const memberContracts = monthContractCustomers.filter((customer) => String(getAssignedUserId(customer)) === String(userId));
      const memberSchedules = monthSchedules.filter((schedule) => String(getAssignedUserId(schedule)) === String(userId));
      const memberSettlements = monthSettlements.filter((entry) => String(getAssignedUserId(entry)) === String(userId));
      return {
        userId,
        name: member.display_name || member.name || member.email || userId || "팀원",
        customerInflowCount: memberCustomers.length,
        contractCustomerCount: memberContracts.length,
        settlementAmount: memberSettlements.reduce((sum, entry) => sum + getSettlementAmount(entry), 0),
        settlementCount: memberSettlements.length,
        scheduleCount: memberSchedules.length,
      };
    });

  return {
    month,
    customerInflowCount: monthCustomers.length,
    contractCustomerCount: monthContractCustomers.length,
    settlementAmount: monthSettlements.reduce((sum, entry) => sum + getSettlementAmount(entry), 0),
    settlementCount: monthSettlements.length,
    scheduleCounts: buildScheduleTypeCounts(monthSchedules),
    memberSummaries,
  };
}
