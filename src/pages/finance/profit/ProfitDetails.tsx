import Card from '../../../components/ui/Card';
import { formatNumber } from '../../../lib/format';
import type { ProfitResult } from './profitCalc';

const vnd = (n: number) => `${n < 0 ? '−' : ''}${formatNumber(Math.abs(Math.round(n)))}đ`;
const pct = (part: number, whole: number) => (whole > 0 ? `${formatNumber((Math.abs(part) / whole) * 100, 1)}%` : '--');

/** Chi tiết phí sàn theo nhóm + tình trạng đơn / quyết toán */
export default function ProfitDetails({ result: r }: { result: ProfitResult }) {
  const fees = [...r.feeLines].sort((a, b) => a.amount - b.amount);
  const maxFee = Math.max(1, ...fees.map((f) => Math.abs(f.amount)));

  const states: { label: string; n: number; tone: string }[] = [
    { label: 'Hoàn tất', n: r.counts.completed, tone: 'bg-accent-green' },
    { label: 'Đang xử lý / giao', n: r.counts.in_progress, tone: 'bg-primary' },
    { label: 'Trả hàng / hoàn tiền', n: r.counts.returned, tone: 'bg-amber-500' },
    { label: 'Đã huỷ', n: r.counts.cancelled, tone: 'bg-muted' },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="font-semibold">Phí sàn & khấu trừ</h3>
          <span className="text-sm text-muted">
            {vnd(r.fees)} · {pct(r.fees, r.revenue)} doanh thu
          </span>
        </div>
        {fees.length === 0 ? (
          <p className="text-sm text-muted">Chưa có số phí — cần file quyết toán.</p>
        ) : (
          <ul className="space-y-2.5">
            {fees.map((f) => (
              <li key={f.key} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink">{f.label}</span>
                  <span className="shrink-0 tabular-nums">
                    <b className={f.amount > 0 ? 'text-accent-green' : 'text-ink'}>{vnd(f.amount)}</b>
                    <span className="ml-2 text-muted">{pct(f.amount, r.revenue)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
                  <div
                    className={`h-full rounded-full ${f.amount > 0 ? 'bg-accent-green/60' : 'bg-primary/70'}`}
                    style={{ width: `${(Math.abs(f.amount) / maxFee) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {r.hasOrders && (
        <Card className="p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="font-semibold">Đơn hàng trong kỳ</h3>
            <span className="text-sm text-muted">{formatNumber(r.counts.total)} đơn</span>
          </div>
          <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-canvas">
            {states.map(
              (s) =>
                s.n > 0 && (
                  <div
                    key={s.label}
                    className={s.tone}
                    style={{ width: `${(s.n / Math.max(1, r.counts.total)) * 100}%` }}
                  />
                ),
            )}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {states.map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                <span className={`size-2 shrink-0 rounded-full ${s.tone}`} />
                <span className="min-w-0 flex-1 text-muted">{s.label}</span>
                <b className="tabular-nums">{formatNumber(s.n)}</b>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center text-sm">
            <div>
              <p className="text-lg font-bold tabular-nums text-ink">{formatNumber(r.counts.settled)}</p>
              <p className="text-muted">đã quyết toán</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums text-ink">{formatNumber(r.counts.unsettled)}</p>
              <p className="text-muted">chờ quyết toán</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums text-ink">{formatNumber(r.counts.none)}</p>
              <p className="text-muted">chưa có số</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
