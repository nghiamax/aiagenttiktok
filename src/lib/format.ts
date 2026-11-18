const vnd = new Intl.NumberFormat('vi-VN');

/** 2740951340 -> "2.740.951.340 VND". null/undefined -> "--" */
export function formatVnd(value: number | null | undefined): string {
  return value == null ? '--' : `${vnd.format(Math.round(value))} VND`;
}

export function formatNumber(value: number | null | undefined, maxFractionDigits = 0): string {
  return value == null
    ? '--'
    : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: maxFractionDigits }).format(value);
}

/** 1.810.000 → "1,81 tr"; 95.000 → "95k" */
export function shortVnd(value: number): string {
  if (value === 0) return '0đ';
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000, 2)} tr`;
  return `${formatNumber(Math.round(value / 1000))}k`;
}

/** ISO → "10:19 07/11/2026" (giờ địa phương). null → "--" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** ISO → "07/11" */
export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Date -> "yyyy-MM-dd" theo giờ địa phương (dùng cho input type="date") */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
