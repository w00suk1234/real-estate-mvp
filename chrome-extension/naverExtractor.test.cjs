const assert = require("node:assert/strict");
const test = require("node:test");
const extractor = require("./naverExtractor.js");

test("extracts monthly rent listing from pair fixture", () => {
  const snapshot = extractor.enrichSnapshot({
    listing_url: "https://new.land.naver.com/offices?articleNo=1",
    title: "아탑동 상가 월세",
    pairs: [
      { key: "가격", value: "월세 6,200/130" },
      { key: "소재지", value: "서울 송파구 아탑동 128-29" },
      { key: "전용면적", value: "36㎡" },
      { key: "층수", value: "4층/10층" },
      { key: "주차", value: "1대 가능" },
      { key: "엘리베이터", value: "있음" },
    ],
    visible_text: "아탑동 상가 월세 월세 6,200/130 전용 36㎡ 주차 1대 가능 엘리베이터 있음",
    images: [{ url: "https://example.com/listing.jpg", width: 640, height: 420 }],
  });

  assert.equal(snapshot.property.transactionType, "월세");
  assert.equal(snapshot.property.deposit, "6200");
  assert.equal(snapshot.property.monthlyRent, "130");
  assert.equal(snapshot.property.exclusiveArea, "36");
  assert.equal(snapshot.property.parking, "1대 가능");
  assert.equal(snapshot.confidence.price, "medium");
  assert.ok(!snapshot.missingFields.includes("가격 확인 필요"));
});

test("extracts jeonse and sale prices without treating them as monthly rent", () => {
  const jeonse = extractor.enrichSnapshot({
    title: "서초동 사무실 전세",
    pairs: [{ key: "전세가", value: "전세 3억 5,000" }],
    visible_text: "서초동 사무실 전세 3억 5,000 전용 42㎡",
  });
  const sale = extractor.enrichSnapshot({
    title: "역삼동 상가 매매",
    pairs: [{ key: "매매가", value: "매매 12억" }],
    visible_text: "역삼동 상가 매매 12억 공급 80㎡",
  });

  assert.equal(jeonse.property.transactionType, "전세");
  assert.equal(jeonse.property.jeonsePrice, "35000");
  assert.equal(jeonse.parsed_fields.deposit, "35000");
  assert.equal(sale.property.transactionType, "매매");
  assert.equal(sale.property.salePrice, "120000");
});

test("marks missing fields when key data is absent", () => {
  const snapshot = extractor.enrichSnapshot({
    title: "네이버 매물 초안",
    pairs: [{ key: "층수", value: "저층" }],
    visible_text: "층수 저층",
  });

  assert.ok(snapshot.missingFields.includes("가격 확인 필요"));
  assert.ok(snapshot.missingFields.includes("면적 확인 필요"));
  assert.ok(snapshot.missingFields.includes("주소 확인 필요"));
  assert.equal(snapshot.confidence.area, "missing");
});

test("normalizes alternate selector-like aliases", () => {
  const snapshot = extractor.enrichSnapshot({
    title: "논현동 매물",
    pairs: [
      { key: "보증금/월세", value: "1,400/85" },
      { key: "위치", value: "서울 서초구 논현동 101-2" },
      { key: "공급면적", value: "50㎡" },
      { key: "승강기", value: "유" },
    ],
    visible_text: "논현동 매물 1,400/85 공급면적 50㎡ 승강기 유",
  });

  assert.equal(snapshot.property.deposit, "1400");
  assert.equal(snapshot.property.monthlyRent, "85");
  assert.equal(snapshot.property.supplyArea, "50");
  assert.equal(snapshot.property.elevator, "있음");
});
