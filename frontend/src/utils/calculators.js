export const BROKERAGE_RATE_TABLE = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

export function parsePositiveNumber(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

export function calculateConvertedDealAmount({ deposit = 0, monthlyRent = 0 }) {
  const safeDeposit = parsePositiveNumber(deposit);
  const safeMonthlyRent = parsePositiveNumber(monthlyRent);
  const baseAmount = safeMonthlyRent > 0 ? safeDeposit + safeMonthlyRent * 100 : safeDeposit;
  const usesSeventyMultiplier = safeMonthlyRent > 0 && baseAmount < 5000;
  const convertedAmount = usesSeventyMultiplier ? safeDeposit + safeMonthlyRent * 70 : baseAmount;

  return {
    deposit: safeDeposit,
    monthlyRent: safeMonthlyRent,
    baseAmount,
    convertedAmount,
    usesSeventyMultiplier,
    formula: safeMonthlyRent
      ? usesSeventyMultiplier
        ? "보증금 + 월세 x 70"
        : "보증금 + 월세 x 100"
      : "보증금",
  };
}

export function calculateBrokerageRateRows({ deposit = 0, monthlyRent = 0, rates = BROKERAGE_RATE_TABLE }) {
  const summary = calculateConvertedDealAmount({ deposit, monthlyRent });
  const rows = rates.map((rate) => {
    const brokerageFee = Math.round(summary.convertedAmount * 10000 * (rate / 100));
    const vat = Math.round(brokerageFee * 0.1);
    return {
      rate,
      brokerageFee,
      vat,
      totalWithVat: brokerageFee + vat,
    };
  });

  return { ...summary, rows };
}

export function formatWon(value) {
  return `${new Intl.NumberFormat("ko-KR").format(Math.round(parsePositiveNumber(value)))}원`;
}

export function formatManwon(value) {
  return `${new Intl.NumberFormat("ko-KR").format(Math.round(parsePositiveNumber(value)))}만원`;
}
