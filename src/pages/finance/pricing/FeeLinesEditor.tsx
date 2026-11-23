import { Plus, X } from 'lucide-react';
import NumberField from './NumberField';
import type { FeeLine } from './calc';

interface FeeLinesEditorProps {
  fees: FeeLine[];
  onChange: (fees: FeeLine[]) => void;
}

const newId = () => `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Các khoản phí của sàn (ngoài phí ngành), sửa trực tiếp — lưu ngay */
export default function FeeLinesEditor({ fees, onChange }: FeeLinesEditorProps) {
  const set = (id: string, patch: Partial<FeeLine>) =>
    onChange(fees.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <div className="space-y-1.5">
      {fees.map((f) => (
        <div key={f.id} className="group flex items-center gap-2">
          <input
            aria-label="Tên khoản phí"
            value={f.label}
            placeholder="Tên khoản phí"
            onChange={(e) => set(f.id, { label: e.target.value })}
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm text-ink outline-none transition hover:border-line focus:border-primary focus:bg-white"
          />
          <NumberField
            ariaLabel={`Mức ${f.label || 'phí'}`}
            value={f.value}
            onChange={(v) => set(f.id, { value: v })}
            decimals={f.kind === 'pct' ? 2 : 0}
            max={f.kind === 'pct' ? 99 : undefined}
            className="w-24"
          />
          <button
            type="button"
            onClick={() => set(f.id, { kind: f.kind === 'pct' ? 'fixed' : 'pct', value: 0 })}
            title="Đổi cách tính: % giá bán ↔ đồng mỗi đơn"
            aria-label={`Đổi đơn vị ${f.label}`}
            className="w-14 shrink-0 rounded-lg bg-canvas py-1.5 text-sm font-medium text-muted transition hover:bg-primary-soft hover:text-primary"
          >
            {f.kind === 'pct' ? '%' : 'đ/đơn'}
          </button>
          <button
            type="button"
            aria-label={`Xoá ${f.label || 'khoản phí'}`}
            onClick={() => onChange(fees.filter((x) => x.id !== f.id))}
            className="rounded-md p-1 text-muted opacity-60 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...fees, { id: newId(), label: '', kind: 'pct', value: 0 }])}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-primary transition hover:bg-primary-soft"
      >
        <Plus className="size-4" /> Thêm khoản phí
      </button>
    </div>
  );
}
