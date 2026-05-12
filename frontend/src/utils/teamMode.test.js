import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScheduleTypeCounts,
  buildTeamMonthlySummary,
  calculatePayrollTotal,
  canInviteSeat,
  getPendingInvitationCount,
  getTeamModeErrorMessage,
  getSeatCapacity,
  getSeatUsage,
  isRawSupabaseError,
  isTeamSchemaMissingError,
  isSubscriptionActive,
  TEAM_MODE_SETUP_MESSAGE,
} from "./teamMode.js";

test("team subscription and seat limit helpers gate team mode", () => {
  assert.equal(isSubscriptionActive({ status: "trialing" }), true);
  assert.equal(isSubscriptionActive({ status: "active" }), true);
  assert.equal(isSubscriptionActive({ status: "canceled" }), false);
  assert.equal(getSeatCapacity({ plan_type: "team_unlimited", is_unlimited: true }), Infinity);
  assert.equal(canInviteSeat({
    subscription: { seat_limit: 2, extra_seat_count: 0 },
    members: [{ status: "active" }],
    invitations: [{ status: "pending" }],
  }), false);
});

test("team seat usage counts duplicate pending email invitations once", () => {
  const members = [{ status: "active" }];
  const invitations = [
    { id: "i1", status: "pending", email: "test2@test2.com" },
    { id: "i2", status: "pending", email: "TEST2@test2.com" },
    { id: "i3", status: "revoked", email: "test3@test3.com" },
  ];

  assert.equal(getPendingInvitationCount(invitations), 1);
  assert.equal(getSeatUsage({ members, invitations }), 2);
});

test("team schedule counters map business aliases", () => {
  const counts = buildScheduleTypeCounts([
    { schedule_type: "고객인입" },
    { schedule_type: "meeting" },
    { schedule_type: "계약서일정" },
    { schedule_type: "잔금날" },
    { schedule_type: "기타" },
  ]);

  assert.equal(counts.inflow, 1);
  assert.equal(counts.meeting, 1);
  assert.equal(counts.contract, 1);
  assert.equal(counts.balance, 1);
});

test("team monthly summary groups by member and month", () => {
  const summary = buildTeamMonthlySummary({
    month: "2026-05",
    members: [
      { user_id: "u1", name: "팀원1", status: "active" },
      { user_id: "u2", name: "팀원2", status: "active" },
    ],
    customers: [
      { id: "c1", assigned_to_user_id: "u1", inflow_date: "2026-05-03", contract_status: "계약금입금" },
      { id: "c2", assigned_to_user_id: "u2", inflow_date: "2026-05-04", contract_status: "미계약" },
      { id: "c3", assigned_to_user_id: "u1", inflow_date: "2026-04-20", contract_status: "정산완료" },
    ],
    schedules: [
      { assigned_to_user_id: "u1", schedule_date: "2026-05-10", schedule_type: "미팅" },
      { assigned_to_user_id: "u2", schedule_date: "2026-05-11", schedule_type: "잔금일" },
    ],
    settlements: [
      { assigned_to_user_id: "u1", balance_date: "2026-05-15", tenant_fee: 1000000, landlord_fee: 500000 },
      { assigned_to_user_id: "u2", balance_date: "2026-06-15", total_fee: 2000000 },
    ],
  });

  assert.equal(summary.customerInflowCount, 2);
  assert.equal(summary.contractCustomerCount, 1);
  assert.equal(summary.settlementAmount, 1500000);
  assert.equal(summary.scheduleCounts.meeting, 1);
  assert.equal(summary.scheduleCounts.balance, 1);
  assert.equal(summary.memberSummaries[0].settlementAmount, 1500000);
});

test("payroll total subtracts deductions", () => {
  assert.equal(calculatePayrollTotal({
    base_pay: 2000000,
    commission_pay: 500000,
    bonus_pay: 100000,
    deduction_amount: 300000,
  }), 2300000);
});

test("team schema cache errors are converted to setup guidance", () => {
  const error = {
    code: "PGRST205",
    message: "Could not find the table 'public.team_members' in the schema cache",
  };

  assert.equal(isTeamSchemaMissingError(error), true);
  assert.equal(getTeamModeErrorMessage(error, "raw fallback"), TEAM_MODE_SETUP_MESSAGE);
});

test("raw Supabase errors are hidden behind friendly fallbacks", () => {
  const error = {
    code: "42501",
    message: "permission denied for table team_members",
  };

  assert.equal(isRawSupabaseError(error), true);
  assert.equal(getTeamModeErrorMessage(error, "팀 생성에 실패했습니다. 설정을 확인해 주세요."), "팀 생성에 실패했습니다. 설정을 확인해 주세요.");
});
