import { useEffect, useState } from 'react';

interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  /** Đơn vị hiện sau ô, ví dụ "đ", "giờ" */
  suffix?: string;
  hint?: string;
  min?: number;
}

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

/** Ô nhập số nguyên, lưu khi rời ô hoặc bấm Enter. Gõ "200.000" hay "200000" đều được */
export default function NumberField({ label, value, onCommit, suffix, hint, min = 0 }: NumberFieldProps) {
  const [draft, setDraft] = useState(fmt(value));
  useEffect(() => setDraft(fmt(value)), [value]);

  function commit() {
    const n = Number(draft.replace(/[^\d]/g, ''));
    if (draft.trim() === '' || !Number.isFinite(n) || n < min) {
      setDraft(fmt(value));
      return;
    }
    if (n !== value) onCommit(n);
    setDraft(fmt(n));
  }

  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
      <span className="mt-1.5 flex items-center rounded-lg border border-line bg-white transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-soft hover:border-muted/40">
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="w-full bg-transparent px-3 py-2 text-right tabular-nums outline-none"
        />
        {suffix && <span className="pr-3 text-muted">{suffix}</span>}
      </span>
    </label>
  );
}
