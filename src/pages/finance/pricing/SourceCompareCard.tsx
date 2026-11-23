import Card from '../../../components/ui/Card';
import { formatNumber } from '../../../lib/format';
import type { PricingMode } from './config';
import type { OrderSource, SourceCompareRow } from './orderSource';

interface SourceCompareCardProps {
  rows: SourceCompareRow[];
  mode: PricingMode;
  selected: OrderSource;
  onSelect: (s: OrderSource) => void;
}

const vnd = (n: number) => `${n < 0 ? '−' : ''}${formatNumber(Math.abs(Math.round(n)))}đ`;

/** So sánh nguồn đơn hàng (như các cột của bảng tính giá): giá đề xuất hoặc lãi theo từng nguồn */
export default function SourceCompareCard({ rows, mode, selected, onSelect }: SourceCompareCardProps) {
  if (rows.every((r) => !r.result)) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 px-3 pb-0.5 pt-2">
        <h3 className="text-sm font-semibold">So sánh theo nguồn đơn</h3>
        <span className="truncate text-[13px] text-muted">{mode === 'price' ? 'cùng mức lãi' : 'cùng giá bán'}</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const on = r.source.id === selected;
          const profit = r.result?.profit ?? null;
          return (
            <li key={r.source.id}>
              <button
                type="button"
                onClick={() => onSelect(r.source.id)}
                aria-pressed={on}
                title="Bấm để chọn nguồn này"
                className={`flex w-full items-center gap-3 px-3 py-1 text-left text-[13px] transition ${
                  on ? 'bg-primary-soft/60' : 'hover:bg-canvas'
                }`}
              >
                <span className={`min-w-0 flex-1 ${on ? 'font-semibold text-primary' : 'text-ink'}`}>
                  {r.source.label}
                </span>
                {mode === 'price' ? (
                  <span className="text-right">
                    <b className="tabular-nums text-ink">{r.price != null ? vnd(r.price) : 'Không đạt'}</b>
                  </span>
                ) : (
                  <span className="text-right">
                    <b className={`tabular-nums ${profit != null && profit < 0 ? 'text-danger' : 'text-accent-green'}`}>
                      {profit != null ? vnd(profit) : '--'}
                    </b>
                    {r.result?.marginPct != null && (
                      <span className="ml-1.5 tabular-nums text-muted">{formatNumber(r.result.marginPct, 1)}%</span>
                    )}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
