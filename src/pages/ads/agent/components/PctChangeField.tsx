import { useEffect, useState } from 'react';

interface PctChangeFieldProps {
  label: string;
  /** % có dấu: dương = tăng, âm = giảm */
  value: number;
  onCommit: (value: number) => void;
  hint?: string;
  /** Cảnh báo vượt giới hạn an toàn */
  warning?: string | null;
}

const BOX =
  'flex items-center rounded-lg border border-line bg-white transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-soft hover:border-muted/40';

/** [Tăng ▾] [20] % — lưu khi rời ô hoặc đổi Tăng/Giảm */
export default function PctChangeField({ label, value, onCommit, hint, warning }: PctChangeFieldProps) {
  const dir = value < 0 ? -1 : 1;
  const [draft, setDraft] = useState(String(Math.abs(value)));
  useEffect(() => setDraft(String(Math.abs(value))), [value]);

  function commit() {
    const n = Number(draft.trim().replace(',', '.'));
    if (draft.trim() === '' || !Number.isFinite(n) || n <= 0 || n > 100) {
      setDraft(String(Math.abs(value)));
      return;
    }
    if (n * dir !== value) onCommit(n * dir);
  }

  return (
    <div className="block text-sm">
      <span className="font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
      <div className="mt-1.5 flex gap-2">
        <select
          aria-label={`${label}: tăng hay giảm`}
          value={dir}
          onChange={(e) => onCommit(Math.abs(value || 10) * Number(e.target.value))}
          className={`${BOX} px-2 py-2 outline-none`}
        >
          <option value={1}>Tăng</option>
          <option value={-1}>Giảm</option>
        </select>
        <span className={`${BOX} flex-1`}>
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${label}: phần trăm`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-full bg-transparent px-3 py-2 text-right tabular-nums outline-none"
          />
          <span className="pr-3 text-muted">%</span>
        </span>
      </div>
      {warning && <span className="mt-1 block text-xs font-medium text-amber-600">{warning}</span>}
    </div>
  );
}
