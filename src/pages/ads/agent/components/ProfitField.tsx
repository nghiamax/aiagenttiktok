import { useEffect, useState } from 'react';

interface ProfitFieldProps {
  /** Số Sếp nhập (null = chưa nhập) */
  manual: number | null;
  /** Số đang dùng: nhập tay, không thì tính từ giá ÷ ROI hoà vốn */
  effective: number | null;
  /** Điều kiện của sản phẩm có dùng "lần lợi nhuận 1 đơn" → bắt buộc có số */
  required: boolean;
  onChange: (value: number | null) => void;
}

const vi = new Intl.NumberFormat('vi-VN');

/** Ô "Lợi nhuận 1 đơn" của 1 sản phẩm trong điều kiện theo sản phẩm (Sếp chốt 26/11) */
export default function ProfitField({ manual, effective, required, onChange }: ProfitFieldProps) {
  const [draft, setDraft] = useState(manual == null ? '' : vi.format(manual));
  useEffect(() => setDraft(manual == null ? '' : vi.format(manual)), [manual]);
  const missing = required && effective == null;

  function commit() {
    const n = Number(draft.replace(/[^\d]/g, ''));
    const next = draft.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : n;
    onChange(next);
    setDraft(next == null ? '' : vi.format(next));
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${missing ? 'bg-rose-50' : 'bg-canvas/70'}`}>
      <label className="flex items-center gap-2 text-sm font-medium">
        Lợi nhuận 1 đơn
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          placeholder={effective != null && manual == null ? vi.format(Math.round(effective)) : 'vd 80.000'}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Lợi nhuận 1 đơn của sản phẩm"
          className={`w-32 rounded-lg border bg-white px-2 py-1.5 text-right text-sm tabular-nums outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-soft ${
            missing ? 'border-danger/60' : 'border-line hover:border-muted/40'
          }`}
        />
        đ
      </label>
      <span className={`text-xs ${missing ? 'font-medium text-danger' : 'text-muted'}`}>
        {missing
          ? 'Bắt buộc nhập — điều kiện bên dưới dùng “lần lợi nhuận 1 đơn”'
          : manual != null
            ? 'Số Sếp nhập'
            : effective != null
              ? 'Đang tính từ giá ÷ ROI hoà vốn — nhập để dùng số của Sếp'
              : 'Chưa có — nhập nếu dùng “lần lợi nhuận 1 đơn”'}
      </span>
    </div>
  );
}
