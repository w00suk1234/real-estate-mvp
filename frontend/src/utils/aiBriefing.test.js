import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePropertyFitScore,
  createRuleBasedBriefing,
  formatAvailability,
  formatPropertyPrice,
  normalizeBriefingProperty,
  sanitizeForLlmPayload,
  validateAndRepairBriefing,
} from "./aiBriefing.js";
import { prepareLlmBudget } from "../../api/_shared/aiServer.js";

function customer(overrides = {}) {
  return {
    id: "customer-1",
    name: "Test Customer",
    max_price: 10000,
    max_deposit: 3000,
    max_monthly_rent: 200,
    preferred_area: "Gangnam",
    min_area_m2: 50,
    parking_required: true,
    elevator_required: true,
    memo: "quiet office with parking",
    phone: "010-1111-2222",
    email: "secret@example.com",
    ...overrides,
  };
}

function property(overrides = {}) {
  return {
    id: "property-1",
    title: "Gangnam Office",
    address: "Gangnam station",
    sale_price: 9000,
    area_m2: 60,
    parking: true,
    elevator: true,
    memo: "quiet office with parking",
    ...overrides,
  };
}

test("scores a property highly when budget, location, size, and required conditions match", () => {
  const result = calculatePropertyFitScore(customer(), property());

  assert.equal(result.propertyId, "property-1");
  assert.ok(result.score >= 80);
  assert.ok(["excellent", "good"].includes(result.grade));
  assert.ok(result.matched.length > 0);
});

test("penalizes budget overrun", () => {
  const ok = calculatePropertyFitScore(customer(), property({ sale_price: 9000 }));
  const over = calculatePropertyFitScore(customer(), property({ sale_price: 14000 }));

  assert.ok(over.score < ok.score);
  assert.ok(over.concerns.length > 0);
});

test("penalizes missing required parking", () => {
  const withParking = calculatePropertyFitScore(customer(), property({ parking: true }));
  const withoutParking = calculatePropertyFitScore(customer(), property({ parking: false }));

  assert.ok(withoutParking.score < withParking.score);
  assert.ok(withoutParking.concerns.length > 0);
});

test("penalizes size shortage and records missing checks for incomplete property data", () => {
  const small = calculatePropertyFitScore(customer(), property({ area_m2: 30 }));
  const incomplete = calculatePropertyFitScore(customer(), property({ address: "", area_m2: 0, parking: "", elevator: "" }));

  assert.ok(small.score < calculatePropertyFitScore(customer(), property({ area_m2: 60 })).score);
  assert.ok(incomplete.missingChecks.length > 0);
});

test("creates rule-based briefing when LLM is not available", () => {
  const result = createRuleBasedBriefing({
    customer: customer(),
    properties: [property({ id: "property-1" }), property({ id: "property-2", sale_price: 11000 })],
    mode: "api_key_missing",
  });

  assert.equal(result.mode, "api_key_missing");
  assert.equal(result.briefing.rankings.length, 2);
  assert.equal(result.briefing.rankings[0].rank, 1);
  assert.ok(result.briefing.customerMessages.short);
});

test("does not include customer phone or email in LLM payload", () => {
  const payload = sanitizeForLlmPayload({
    customer: customer(),
    properties: [property()],
    ruleBasedResults: [{ propertyId: "property-1", rank: 1, score: 90, grade: "excellent" }],
  });
  const serialized = JSON.stringify(payload);

  assert.ok(!serialized.includes("010-1111-2222"));
  assert.ok(!serialized.includes("secret@example.com"));
});

test("keeps normalized property display data on repeated normalization and formats availability", () => {
  const once = normalizeBriefingProperty(property({ parking: true, elevator: false }));
  const twice = normalizeBriefingProperty(once);

  assert.equal(twice.displayName, "Gangnam Office");
  assert.equal(twice.addressOrArea, "Gangnam station");
  assert.equal(formatAvailability(twice.parking), "O");
  assert.equal(formatAvailability(twice.elevator), "X");
  assert.notEqual(formatPropertyPrice(twice), "확인 필요");
});

test("reads saved brochure form fields from Supabase property data", () => {
  const saved = normalizeBriefingProperty({
    id: "property-form",
    price_summary: "보증금 6,200만원 / 월세 130만원",
    data: {
      form: {
        title: "아탑동 상가 월세 추천매물 29",
        address: "서울 송파구 아탑동 128-29",
        deal_type: "월세",
        deposit: "6200",
        monthly_rent: "130",
        exclusive_area: "36",
        exclusive_area_unit: "㎡",
        floor: "4층",
        parking_count: "1",
        elevator: "있음",
      },
    },
  });

  assert.equal(saved.displayName, "아탑동 상가 월세 추천매물 29");
  assert.equal(saved.addressOrArea, "서울 송파구 아탑동 128-29");
  assert.equal(saved.sizeM2, 36);
  assert.equal(formatAvailability(saved.parking), "O");
  assert.equal(formatAvailability(saved.elevator), "O");
});

test("repairs LLM rank and score back to deterministic server values", () => {
  const rule = createRuleBasedBriefing({
    customer: customer(),
    properties: [property({ id: "property-1" }), property({ id: "property-2", sale_price: 11000 })],
  });
  const scored = rule.briefing.rankings.map((item) => ({
    propertyId: item.propertyId,
    rank: item.rank,
    score: item.score,
    grade: item.grade,
  }));
  const badLlm = {
    ...rule.briefing,
    rankings: [
      {
        ...rule.briefing.rankings[0],
        propertyId: "property-1",
        rank: 99,
        score: 1,
        strengths: ["changed"],
        concerns: [],
        talkingPoints: [],
      },
    ],
  };

  const repaired = validateAndRepairBriefing(badLlm, rule.briefing, scored);

  assert.equal(repaired.rankings[0].rank, scored[0].rank);
  assert.equal(repaired.rankings[0].score, scored[0].score);
});

test("blocks OpenAI call when monthly, daily, per-request, or input limits are exceeded", () => {
  const baseConfig = {
    model: "gpt-5-nano",
    maxOutputTokens: 1200,
    maxInputChars: 16000,
    maxInputTokens: 6000,
    monthlyLimit: 5,
    dailyLimit: 0.5,
    perRequestLimit: 0.02,
  };
  const payload = { text: "x".repeat(500) };

  assert.equal(prepareLlmBudget({ config: { ...baseConfig, monthlyLimit: 0.00001 }, llmPayload: payload, usageSums: { monthUsd: 0, dayUsd: 0 } }).blocked, true);
  assert.equal(prepareLlmBudget({ config: { ...baseConfig, dailyLimit: 0.00001 }, llmPayload: payload, usageSums: { monthUsd: 0, dayUsd: 0 } }).blocked, true);
  assert.equal(prepareLlmBudget({ config: { ...baseConfig, perRequestLimit: 0.00001 }, llmPayload: payload, usageSums: { monthUsd: 0, dayUsd: 0 } }).blocked, true);
  assert.equal(
    prepareLlmBudget({
      config: { ...baseConfig, maxInputChars: 10 },
      llmPayload: payload,
      usageSums: { monthUsd: 0, dayUsd: 0 },
    }).blocked,
    true,
  );
});
