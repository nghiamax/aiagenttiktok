import { Plus, X } from 'lucide-react';
import Card from '../../../components/ui/Card';
import NumberField from '../pricing/NumberField';
import type { OtherCost } from './profitCalc';

interface OtherCostsEditorProps {
  costs: OtherCost[];
  onChange: (costs: OtherCost[]) => void;
}

const KINDS: { value: OtherCost['kind']; label: string; suffix: string }[] = [
  { value: 'perOrder', label: 'đ / đơn', suffix: 'đ' },
  { value: 'pctRevenue', label: '% doanh thu', suffix: '%' },
  { value: 'fixed', label: 'đ cả kỳ', suffix: 'đ' },
];

const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Chi phí ngoài sàn do Sếp tự nhập (đóng gói, nhân sự, mặt bằng…) — mặc định trống */
export default function OtherCostsEditor({ costs, onChange }: OtherCostsEditorProps) {
  const update = (id: string, patch: Partial<OtherCost>) =>
    onChange(costs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <Card className="p-5">
      <div className="mb-3">
        <h3 className="font-semibold">Chi phí khác ngoài sàn</h3>
        <p className="mt-0.5 text-sm text-muted">
          Đóng gói, nhân sự, mặt bằng, phí ship tự trả… Tính theo đơn (đơn không huỷ), theo % doanh thu hoặc 1 khoản cả
          kỳ.
        </p>
      </div>
      {costs.length > 0 && (
        <ul className="mb-3 space-y-2">
          {costs.map((c) => {
            const kind = KINDS.find((k) => k.value === c.kind) ?? KINDS[0];
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <input
                  aria-label="Tên chi phí"
                  value={c.label}
                  placeholder="Tên chi phí, vd Đóng gói"
                  onChange={(e) => update(c.id, { label: e.target.value })}
                  className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <NumberField
                  compact
                  ariaLabel={`Mức ${c.label || 'chi phí'}`}
                  value={c.value}
                  onChange={(v) => update(c.id, { value: v })}
                  suffix={kind.suffix}
                  decimals={c.kind === 'pctRevenue' ? 2 : 0}
                  max={c.kind === 'pctRevenue' ? 100 : undefined}
                  className="w-36"
                />
                <select
                  aria-label="Cách tính"
                  value={c.kind}
                  onChange={(e) => update(c.id, { kind: e.target.value as OtherCost['kind'] })}
                  className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-primary"
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`Xoá ${c.label || 'chi phí'}`}
                  onClick={() => onChange(costs.filter((x) => x.id !== c.id))}
                  className="rounded-md p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger"
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={() => onChange([...costs, { id: newId(), label: '', kind: 'perOrder', value: 0 }])}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-primary transition hover:bg-primary-soft"
      >
        <Plus className="size-4" /> Thêm chi phí
      </button>
    </Card>
  );
}
