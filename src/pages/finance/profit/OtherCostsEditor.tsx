import { Plus, X } from 'lucide-react';
import Card from '../../../components/ui/Card';
import { formatNumber } from '../../../lib/format';
import NumberField from '../pricing/NumberField';
import { otherCostAmount, type OtherCost, type OtherCostBases, type OtherCostKind } from './profitCalc';

interface OtherCostsEditorProps {
  costs: OtherCost[];
  onChange: (costs: OtherCost[]) => void;
  /** Số đơn / đơn hoàn / sản phẩm / doanh thu của kỳ → hiện phép tính từng dòng */
  bases: OtherCostBases;
}

/** Cách tính: nhân với cái gì */
const KINDS: { value: OtherCostKind; label: string; suffix: string; unit: (b: OtherCostBases) => string }[] = [
  {
    value: 'perOrder',
    label: 'đ / đơn bán (không huỷ)',
    suffix: 'đ',
    unit: (b) => `${formatNumber(b.orders)} đơn bán`,
  },
  {
    value: 'perReturn',
    label: 'đ / đơn hoàn (trả hàng)',
    suffix: 'đ',
    unit: (b) => `${formatNumber(b.returned)} đơn hoàn`,
  },
  { value: 'perCancel', label: 'đ / đơn huỷ', suffix: 'đ', unit: (b) => `${formatNumber(b.cancelled)} đơn huỷ` },
  { value: 'perUnit', label: 'đ / sản phẩm bán ra', suffix: 'đ', unit: (b) => `${formatNumber(b.units)} sản phẩm` },
  { value: 'pctRevenue', label: '% doanh thu', suffix: '%', unit: (b) => `doanh thu ${vnd(b.revenue)}` },
  { value: 'fixed', label: 'đ cả kỳ (tháng)', suffix: 'đ', unit: () => '' },
];

/** Thêm nhanh các khoản hay gặp (Sếp chọn rồi chỉ việc nhập số) */
const PRESETS: { label: string; kind: OtherCostKind }[] = [
  { label: 'Đơn hoàn', kind: 'perReturn' },
  { label: 'Đóng gói', kind: 'perOrder' },
  { label: 'Phí ship shop tự trả', kind: 'perOrder' },
  { label: 'Nhân viên', kind: 'fixed' },
  { label: 'Mặt bằng', kind: 'fixed' },
  { label: 'Điện, nước, internet', kind: 'fixed' },
];

const vnd = (n: number) => `${formatNumber(Math.round(n))}đ`;
const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Chi phí ngoài sàn do Sếp tự nhập — chọn đúng cách tính, mỗi dòng hiện phép tính để kiểm tra */
export default function OtherCostsEditor({ costs, onChange, bases }: OtherCostsEditorProps) {
  const update = (id: string, patch: Partial<OtherCost>) =>
    onChange(costs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const add = (label: string, kind: OtherCostKind) => onChange([...costs, { id: newId(), label, kind, value: 0 }]);
  const total = costs.reduce((s, c) => s + (c.value > 0 ? otherCostAmount(c, bases) : 0), 0);

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Chi phí khác ngoài sàn</h3>
          <p className="mt-0.5 text-sm text-muted">
            Chọn đúng <b className="text-ink">cách tính</b> cho từng khoản: theo đơn bán, đơn hoàn, đơn huỷ, sản phẩm, %
            doanh thu hoặc 1 khoản cả kỳ (nhân viên, mặt bằng…). Kỳ này: {formatNumber(bases.orders)} đơn bán ·{' '}
            {formatNumber(bases.returned)} đơn hoàn · {formatNumber(bases.cancelled)} đơn huỷ ·{' '}
            {formatNumber(bases.units)} sản phẩm.
          </p>
        </div>
        {total > 0 && (
          <p className="shrink-0 text-right">
            <span className="block text-sm text-muted">Tổng chi phí khác</span>
            <span className="text-lg font-bold tabular-nums text-ink">−{vnd(total)}</span>
          </p>
        )}
      </div>

      {/* Thêm nhanh */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm text-muted">Thêm nhanh:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => add(p.label, p.kind)}
            className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-sm text-ink/80 transition hover:border-primary hover:bg-primary-soft hover:text-primary"
          >
            <Plus className="size-3.5" />
            {p.label}
            <span className="text-xs text-muted">
              · {KINDS.find((k) => k.value === p.kind)!.label.replace(/ \(.*\)$/, '')}
            </span>
          </button>
        ))}
      </div>

      {costs.length > 0 && (
        <ul className="mb-3 divide-y divide-line rounded-xl border border-line">
          {costs.map((c) => {
            const kind = KINDS.find((k) => k.value === c.kind) ?? KINDS[0];
            const amount = c.value > 0 ? otherCostAmount(c, bases) : 0;
            const unit = kind.unit(bases);
            return (
              <li
                key={c.id}
                className="grid items-center gap-2 px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_9rem_14rem_minmax(0,15rem)_auto]"
              >
                <input
                  aria-label="Tên chi phí"
                  value={c.label}
                  placeholder="Tên chi phí, vd Đóng gói"
                  onChange={(e) => update(c.id, { label: e.target.value })}
                  className="min-w-0 rounded-lg border border-line px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <NumberField
                  compact
                  ariaLabel={`Mức ${c.label || 'chi phí'}`}
                  value={c.value}
                  onChange={(v) => update(c.id, { value: v })}
                  suffix={kind.suffix}
                  decimals={c.kind === 'pctRevenue' ? 2 : 0}
                  max={c.kind === 'pctRevenue' ? 100 : undefined}
                />
                <select
                  aria-label="Cách tính"
                  value={c.kind}
                  onChange={(e) => update(c.id, { kind: e.target.value as OtherCostKind })}
                  className="rounded-lg border border-line bg-white px-2.5 py-2 text-sm outline-none transition focus:border-primary"
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <p className="text-sm tabular-nums text-muted md:text-right" title="Phép tính">
                  {c.value > 0 ? (
                    <>
                      {c.kind === 'fixed'
                        ? 'Cả kỳ'
                        : c.kind === 'pctRevenue'
                          ? `${formatNumber(c.value, 2)}% × ${unit}`
                          : `${unit} × ${vnd(c.value)}`}{' '}
                      = <b className="text-ink">−{vnd(amount)}</b>
                    </>
                  ) : (
                    'Nhập số tiền'
                  )}
                </p>
                <button
                  type="button"
                  aria-label={`Xoá ${c.label || 'chi phí'}`}
                  onClick={() => onChange(costs.filter((x) => x.id !== c.id))}
                  className="justify-self-end rounded-md p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger"
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
        onClick={() => add('', 'perOrder')}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-primary transition hover:bg-primary-soft"
      >
        <Plus className="size-4" /> Thêm chi phí khác
      </button>
    </Card>
  );
}
