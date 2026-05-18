import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPayload, normalizeResult } from "./ai-briefing.js";

function customer(overrides = {}) {
  return {
    name: "한서윤",
    minArea: "48㎡ 이상",
    deposit: "보증금 6,500만원 이하",
    monthlyRent: "월세 140만원 이하",
    memo: "역삼동 48m2 이상, 보증금 6500만원 이하, 월세 140만원 이하, 주차 필요 뷰티샵 용도 문의 고객",
    ...overrides,
  };
}

function property(overrides = {}) {
  return {
    id: "p1",
    title: "역삼동 상가",
    address: "서울 강남구 역삼동",
    price: "보증금 3,000만원 / 월세 100만원",
    area: "52㎡",
    parking: "가능",
    memo: "뷰티샵 조건 확인 가능한 테스트 매물입니다.",
    ...overrides,
  };
}

function llmResult(properties, overrides = {}) {
  return {
    customerSummary: "고객 조건 요약",
    recommendationSummary: "추천 요약",
    ranking: properties.map((item, index) => ({
      propertyId: item.id,
      rank: index + 1,
      title: item.title,
      fitScore: "높음",
      isRecommended: true,
      conditionSummary: "AI 요약",
      failedRequiredConditions: [],
      reason: "AI 추천 이유",
      weakPoint: "AI 아쉬운 점",
      talkingPoint: "AI 상담 포인트",
    })),
    consultingMemo: "상담 메모",
    customerMessage: "고객 메시지",
    checkPoints: ["확인사항"],
    ...overrides,
  };
}

test("blocks high fitScore when minimum area is not met", () => {
  const payload = buildPayload({
    customer: customer(),
    properties: [
      property({ id: "small", title: "32㎡ 매물", area: "32㎡" }),
      property({ id: "ok", title: "조건 충족 매물" }),
    ],
  });
  const small = payload.properties.find((item) => item.id === "small");
  assert.equal(small.conditionChecks.area.passed, false);
  assert.equal(small.conditionChecks.area.message, "최소 면적 조건 미달");

  const result = normalizeResult(llmResult(payload.properties), payload.properties);
  const ranking = result.ranking.find((item) => item.propertyId === "small");
  assert.notEqual(ranking.fitScore, "높음");
  assert.ok(ranking.failedRequiredConditions.includes("면적"));
});

test("blocks high fitScore when monthly rent exceeds customer limit", () => {
  const payload = buildPayload({
    customer: customer(),
    properties: [
      property({ id: "expensive", title: "월세 초과 매물", price: "보증금 3,000만원 / 월세 220만원", monthlyRent: "220만원" }),
      property({ id: "ok", title: "조건 충족 매물" }),
    ],
  });
  const expensive = payload.properties.find((item) => item.id === "expensive");
  assert.equal(expensive.conditionChecks.monthlyRent.passed, false);

  const result = normalizeResult(llmResult(payload.properties), payload.properties);
  const ranking = result.ranking.find((item) => item.propertyId === "expensive");
  assert.notEqual(ranking.fitScore, "높음");
});

test("marks parking as needs confirmation when required parking is unknown", () => {
  const payload = buildPayload({
    customer: customer(),
    properties: [
      property({ id: "unknown-parking", title: "주차 확인 매물", parking: "확인 필요" }),
      property({ id: "ok", title: "조건 충족 매물" }),
    ],
  });
  const unknown = payload.properties.find((item) => item.id === "unknown-parking");
  assert.equal(unknown.conditionChecks.parking.passed, null);
  assert.equal(unknown.conditionChecks.parking.message, "주차 가능 여부 확인 필요");
});

test("returns condition adjustment notice when all candidates miss required conditions", () => {
  const payload = buildPayload({
    customer: customer(),
    properties: [
      property({ id: "fail-1", title: "작은 병원 매물", area: "32㎡", memo: "병원 조건 테스트 매물입니다." }),
      property({ id: "fail-2", title: "월세 초과 카페 매물", area: "37㎡", price: "보증금 3,000만원 / 월세 220만원", memo: "카페 조건 테스트 매물입니다." }),
    ],
  });
  const result = normalizeResult(llmResult(payload.properties), payload.properties);
  assert.equal(result.hasRecommendedProperties, false);
  assert.match(result.conditionNotice, /조건에 완전히 맞는 매물이 없습니다/);
  assert.ok(result.ranking.every((item) => item.isRecommended === false));
});
