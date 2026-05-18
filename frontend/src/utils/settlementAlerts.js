const DONE_STATUS = "정산완료";

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getSettlementDate(entry = {}) {
  return entry.balance_date || entry.date || String(entry.created_at || "").slice(0, 10);
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
