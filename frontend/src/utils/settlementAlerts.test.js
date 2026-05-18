import assert from "node:assert/strict";
import test from "node:test";
import { buildScheduleSettlementEntries, getUpcomingSettlements } from "./settlementAlerts.js";

test("creates upcoming settlement entries from balance schedules when settlement rows are missing", () => {
  const schedules = [
    {
      id: "schedule-1",
      schedule_type: "잔금일",
      schedule_date: "2026-05-19",
      title: "안지후 잔금일",
      linked_customer_id: "customer-1",
    },
    {
      id: "schedule-2",
      schedule_type: "미팅",
      schedule_date: "2026-05-20",
      title: "상담",
    },
  ];
  const customers = [{ id: "customer-1", name: "안지후", phone: "010-0000-0000", property_type: "사무실" }];

  const entries = buildScheduleSettlementEntries(schedules, customers, []);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].customer_name, "안지후");
  assert.equal(entries[0].balance_date, "2026-05-19");
  assert.equal(entries[0].source, "잔금일정");
  assert.equal(entries[0].is_schedule_projection, true);
});

test("does not duplicate balance schedule when a matching settlement already exists", () => {
  const schedules = [{ id: "schedule-1", schedule_type: "잔금일", schedule_date: "2026-05-19", title: "안지후 잔금일", customer_id: "customer-1" }];
  const settlements = [{ id: "settlement-1", schedule_id: "schedule-1", customer_id: "customer-1", balance_date: "2026-05-19" }];

  assert.equal(buildScheduleSettlementEntries(schedules, [], settlements).length, 0);
});

test("upcoming settlements include schedule-derived entries within seven days", () => {
  const entries = buildScheduleSettlementEntries(
    [{ id: "schedule-1", schedule_type: "잔금일", schedule_date: "2026-05-21", title: "문로건 잔금일" }],
    [],
    [],
  );
  const upcoming = getUpcomingSettlements(entries, { today: new Date(2026, 4, 18), days: 7, limit: 5 });

  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].customer_name, "문로건");
  assert.equal(upcoming[0].daysLeft, 3);
});
