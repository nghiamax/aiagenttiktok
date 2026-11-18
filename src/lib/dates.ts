/** Tiện ích ngày dạng chuỗi yyyy-MM-dd (tính theo UTC để không lệch múi giờ) */

const DAY = 86_400_000;

export const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso: string, n: number) => toIso(Date.parse(iso) + n * DAY);

/** Số ngày giữa 2 ngày, tính cả 2 đầu */
export const spanDays = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;

/** dd/MM/yyyy */
export function formatDmy(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** dd/MM */
export function formatDm(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export interface YearMonth {
  year: number;
  /** 0–11 */
  month: number;
}

export function ymOf(iso: string): YearMonth {
  const [y, m] = iso.split('-').map(Number);
  return { year: y, month: m - 1 };
}

export function addMonths({ year, month }: YearMonth, n: number): YearMonth {
  const total = year * 12 + month + n;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** 42 ô (6 tuần, bắt đầu thứ Hai) của một tháng; inMonth = ngày thuộc tháng đang xem */
export function monthGrid({ year, month }: YearMonth): { iso: string; day: number; inMonth: boolean }[] {
  const first = Date.UTC(year, month, 1);
  const offset = (new Date(first).getUTCDay() + 6) % 7; // thứ Hai = 0
  return Array.from({ length: 42 }, (_, i) => {
    const ms = first + (i - offset) * DAY;
    const d = new Date(ms);
    return { iso: toIso(ms), day: d.getUTCDate(), inMonth: d.getUTCMonth() === month };
  });
}
