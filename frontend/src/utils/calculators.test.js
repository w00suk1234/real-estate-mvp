import assert from "node:assert/strict";
import test from "node:test";
import { BROKERAGE_RATE_TABLE, calculateBrokerageRateRows, parsePositiveNumber } from "./calculators.js";

test("brokerage calculator uses deposit plus monthly rent times 100 when amount is at least 50 million won", () => {
  const result = calculateBrokerageRateRows({ deposit: 1000, monthlyRent: 50 });

  assert.equal(result.convertedAmount, 6000);
  assert.equal(result.usesSeventyMultiplier, false);
  assert.equal(result.rows.length, 9);
  assert.deepEqual(result.rows.map((row) => row.rate), BROKERAGE_RATE_TABLE);
  assert.equal(result.rows[0].brokerageFee, 60000);
  assert.equal(result.rows[0].vat, 6000);
  assert.equal(result.rows[0].totalWithVat, 66000);
});

test("brokerage calculator applies 70 multiplier when base monthly rent conversion is under 50 million won", () => {
  const result = calculateBrokerageRateRows({ deposit: 500, monthlyRent: 20 });

  assert.equal(result.baseAmount, 2500);
  assert.equal(result.convertedAmount, 1900);
  assert.equal(result.usesSeventyMultiplier, true);
  assert.equal(result.formula, "보증금 + 월세 x 70");
});

test("brokerage calculator uses deposit only when monthly rent is zero", () => {
  const result = calculateBrokerageRateRows({ deposit: 3000, monthlyRent: 0 });

  assert.equal(result.convertedAmount, 3000);
  assert.equal(result.formula, "보증금");
});

test("brokerage calculator guards empty, negative, and text inputs", () => {
  assert.equal(parsePositiveNumber(""), 0);
  assert.equal(parsePositiveNumber("-100"), 0);
  assert.equal(parsePositiveNumber("abc"), 0);

  const result = calculateBrokerageRateRows({ deposit: "-1000", monthlyRent: "abc" });
  assert.equal(result.convertedAmount, 0);
  assert.equal(result.rows[8].totalWithVat, 0);
});
