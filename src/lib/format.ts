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

/** Date -> "yyyy-MM-dd" theo giờ địa phương (dùng cho input type="date") */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
