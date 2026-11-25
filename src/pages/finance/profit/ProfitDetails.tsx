import Card from '../../../components/ui/Card';
import { formatNumber } from '../../../lib/format';
import type { ProfitResult } from './profitCalc';
import ShopeeIncomeCard from './ShopeeIncomeCard';

const vnd = (n: number) => `${n < 0 ? '−' : ''}${formatNumber(Math.abs(Math.round(n)))}đ`;
const pct = (part: number, whole: number) => (whole > 0 ? `${formatNumber((Math.abs(part) / whole) * 100, 1)}%` : '--');

/** Chi tiết phí sàn theo nhóm + tình trạng đơn / quyết toán */
export default function ProfitDetails({
  result: r,
  platform,
}: {
  result: ProfitResult;
  platform?: 'tiktok' | 'shopee';
}) {
  const fees = [...r.feeLines].sort((a, b) => a.amount - b.amount);
  // Nhóm theo `section`, giữ thứ tự nhóm trong FEE_GROUPS; trong nhóm khoản lớn trước
  const sections = [...new Set(r.feeLines.map((f) => f.section ?? 'Khác'))].map((name) => {
    const lines = fees.filter((f) => (f.section ?? 'Khác') === name);
    return { name, lines, total: lines.reduce((x, f) => x + f.amount, 0) };
  });

  const states: { label: string; n: number; tone: string }[] = [
    { label: 'Hoàn tất', n: r.counts.completed, tone: 'bg-accent-green' },
    { label: 'Đang xử lý / giao', n: r.counts.in_progress, tone: 'bg-primary' },
    { label: 'Trả hàng / hoàn tiền', n: r.counts.returned, tone: 'bg-amber-500' },
    { label: 'Đã huỷ', n: r.counts.cancelled, tone: 'bg-muted' },
  ];

  return (
    <div className="space-y-6">
      {platform === 'shopee' && r.feeLines.length > 0 ? (
        <ShopeeIncomeCard result={r} />
      ) : (
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
            // Mỗi cột phí trong file = 1 dòng, xếp theo nhóm + tổng nhóm (không bỏ sót khoản nào)
            <div className="space-y-3">
              {sections.map((sec) => (
                <div key={sec.name}>
                  <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1 text-sm">
                    <span className="font-semibold text-ink">{sec.name}</span>
                    <span className="shrink-0 tabular-nums">
                      <b className={sec.total > 0 ? 'text-accent-green' : 'text-ink'}>{vnd(sec.total)}</b>
                      <span className="ml-2 inline-block w-11 text-right text-muted">{pct(sec.total, r.revenue)}</span>
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {sec.lines.map((f) => (
                      <li key={f.key} className="flex items-baseline justify-between gap-3 pl-3 text-sm">
                        <span className="text-muted">{f.label}</span>
                        <span className="shrink-0 tabular-nums">
                          <span className={f.amount > 0 ? 'text-accent-green' : 'text-ink'}>{vnd(f.amount)}</span>
                          <span className="ml-2 inline-block w-11 text-right text-muted">
                            {pct(f.amount, r.revenue)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {r.adjustmentLines.length > 0 && (
                <div>
                  <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1 text-sm">
                    <span className="font-semibold text-ink">Điều chỉnh (ngoài Tổng phí)</span>
                    <b className="shrink-0 tabular-nums text-ink">
                      {vnd(r.adjustmentLines.reduce((x, a) => x + a.amount, 0))}
                    </b>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {r.adjustmentLines.map((a) => (
                      <li key={a.label} className="flex items-baseline justify-between gap-3 pl-3 text-sm">
                        <span className="text-muted">
                          {a.label} · {formatNumber(a.count)} lần
                        </span>
                        <span className="shrink-0 tabular-nums text-ink">{vnd(a.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {r.adsTopup.count > 0 && !r.adsTopup.counted && (
                <p className="rounded-lg bg-canvas px-3 py-2 text-sm text-muted">
                  Nạp ví quảng cáo từ số dư: <b className="tabular-nums text-ink">{vnd(r.adsTopup.amount)}</b> (
                  {formatNumber(r.adsTopup.count)} lần) — không trừ, chi phí quảng cáo lấy theo file quảng cáo.
                </p>
              )}
            </div>
          )}
        </Card>
      )}

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
