// Month helpers. Months are strings like "2026-10".

export function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
}

export const currentMonth = () => monthKey(new Date());
