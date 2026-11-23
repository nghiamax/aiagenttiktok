import { useEffect, useId, useState } from 'react';

interface NumberFieldProps {
  label?: string;
  /** Dùng khi không có label hiển thị */
  ariaLabel?: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  /** Số chữ số thập phân cho phép (0 = số nguyên, có dấu chấm ngăn cách hàng nghìn) */
  decimals?: number;
  max?: number;
  className?: string;
  /** Cỡ nhỏ (dùng trong bảng) */
  compact?: boolean;
}

const fmt = (v: number, decimals: number) =>
  v === 0
    ? ''
    : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: decimals, useGrouping: decimals === 0 }).format(v);

/** Ô nhập số kiểu Việt Nam: tiền 100.000 (dấu chấm ngăn nghìn) · số lẻ 0,5 hoặc 0.5 */
function parse(text: string, decimals: number): number {
  const cleaned = decimals > 0 ? text.replace(',', '.') : text.replace(/\D/g, '');
  const n = Number.parseFloat(cleaned.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export default function NumberField({
  label,
  ariaLabel,
  value,
  onChange,
  suffix,
  decimals = 0,
  max,
  className = '',
  compact = false,
}: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(() => fmt(value, decimals));
  const [focused, setFocused] = useState(false);

  // Giá trị đổi từ ngoài (thanh kéo, chọn ngành…) → cập nhật chữ khi không đang gõ
  useEffect(() => {
    if (!focused) setText(fmt(value, decimals));
  }, [value, decimals, focused]);

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <div
        className={`flex items-center ${compact ? 'rounded-lg' : 'rounded-xl'} border border-line bg-white transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15`}
      >
        <input
          id={id}
          aria-label={label ? undefined : ariaLabel}
          inputMode={decimals > 0 ? 'decimal' : 'numeric'}
          placeholder="0"
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(fmt(value, decimals));
          }}
          onChange={(e) => {
            let raw = e.target.value;
            if (decimals === 0) {
              const n = parse(raw, 0);
              raw = fmt(n, 0);
            }
            setText(raw);
            let n = parse(raw, decimals);
            if (max != null) n = Math.min(n, max);
            onChange(n);
          }}
          className={`min-w-0 flex-1 rounded-xl bg-transparent font-semibold ${compact ? 'px-2.5 py-1.5 text-sm' : 'px-3 py-2 text-[15px]'} tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-muted/60`}
        />
        {suffix && <span className={`${compact ? 'pr-2.5' : 'pr-3'} text-sm text-muted`}>{suffix}</span>}
      </div>
    </div>
  );
}
