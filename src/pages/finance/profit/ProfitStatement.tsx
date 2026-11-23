import Card from '../../../components/ui/Card';
import { formatNumber } from '../../../lib/format';
import type { ProfitOptions, ProfitResult } from './profitCalc';

interface ProfitStatementProps {
  result: ProfitResult;
  options: ProfitOptions;
  hasUnsettledFile: boolean;
  onOptions: (o: ProfitOptions) => void;
}

const vnd = (n: number) => `${n < 0 ? '−' : ''}${formatNumber(Math.abs(Math.round(n)))}đ`;

function Line({
  label,
  sub,
  amount,
  sign,
  strong,
  tone,
}: {
  label: string;
  sub?: string | null;
  amount: number;
  /** Dấu hiển thị trước số: trừ / cộng / bằng */
  sign: '−' | '+' | '=' | '';
  strong?: boolean;
  tone?: string;
}) {
  return (
    <div className={`flex items-start gap-3 px-5 py-3 ${strong ? 'bg-canvas/70' : ''}`}>
      <span className="w-4 shrink-0 pt-0.5 text-center font-semibold text-muted">{sign}</span>
      <span className="min-w-0 flex-1">
        <span className={strong ? 'font-semibold text-ink' : 'text-ink'}>{label}</span>
        {sub && <span className="block text-sm text-muted">{sub}</span>}
      </span>
      <span className={`shrink-0 tabular-nums ${strong ? 'text-lg font-bold' : 'font-medium'} ${tone ?? 'text-ink'}`}>
        {vnd(amount)}
      </span>
    </div>
  );
}

function Toggle({
  on,
  label,
  hint,
  onChange,
}: {
  on: boolean;
  label: string;
  hint: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-canvas"
    >
      <span className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${on ? 'bg-primary' : 'bg-line'}`}>
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
      <span className="text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="block text-muted">{hint}</span>
      </span>
    </button>
  );
}

/** Bảng lãi lỗ: doanh thu → phí sàn → tiền về → giá vốn → quảng cáo → chi phí khác → lợi nhuận */
export default function ProfitStatement({ result: r, options, hasUnsettledFile, onOptions }: ProfitStatementProps) {
  const payout = r.settled + r.unsettled;
  const diff = payout - r.revenue - r.fees;
  const profitTone = r.profit < 0 ? 'text-danger' : 'text-accent-green';

  return (
    <Card className="overflow-hidden">
      <div className="px-5 pb-2 pt-5">
        <h3 className="font-semibold">Lãi lỗ thực tế</h3>
        <p className="mt-0.5 text-sm text-muted">Số theo file quyết toán của TikTok, không ước lượng phí.</p>
      </div>
      <div className="divide-y divide-line">
        <Line sign="" label="Doanh thu hàng hoá" sub="Sau giảm giá của shop, đã trừ hoàn tiền" amount={r.revenue} />
        <Line sign="−" label="Phí sàn & khấu trừ" sub="Chi tiết ở khung bên cạnh" amount={r.fees} />
        {Math.abs(diff) >= 1 && (
          <Line sign="+" label="Điều chỉnh khác" sub="Bồi hoàn, điều chỉnh của TikTok" amount={diff} />
        )}
        <Line
          sign="="
          strong
          label="Tiền về"
          sub={
            r.unsettled ? `Đã về ${vnd(r.settled)} · chờ về ${vnd(r.unsettled)} (ước tính)` : 'Tổng số tiền quyết toán'
          }
          amount={payout}
        />
        <Line
          sign="−"
          label="Giá vốn hàng bán"
          sub={
            r.missingCost.skus > 0
              ? `${r.missingCost.skus} SKU chưa có giá vốn (${formatNumber(r.missingCost.qty)} sản phẩm) — đang tính 0đ`
              : r.hasOrders
                ? 'Giá vốn × số lượng bán (trừ trả hàng, bỏ đơn huỷ)'
                : 'Cần file đơn hàng để tính'
          }
          amount={-r.cogs}
          tone={r.missingCost.skus > 0 ? 'text-amber-700' : undefined}
        />
        <Line
          sign="−"
          label="Quảng cáo"
          sub={
            !r.hasAds
              ? 'Chưa có file quảng cáo'
              : options.dedupeGmvMax && r.gmvInSettlement > 0
                ? `File quảng cáo ${vnd(r.adsFile)} − đã trừ trong quyết toán ${vnd(r.gmvInSettlement)}`
                : `Theo file quảng cáo`
          }
          amount={-r.ads}
        />
        {r.otherLines.length > 0 && (
          <Line
            sign="−"
            label="Chi phí khác"
            sub={r.otherLines.map((l) => `${l.label} ${vnd(l.amount)}`).join(' · ')}
            amount={-r.other}
          />
        )}
        <div className="flex items-end gap-3 bg-canvas px-5 py-4">
          <span className="w-4 shrink-0 text-center font-semibold text-muted">=</span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">Lợi nhuận</span>
            <span className="text-sm text-muted">
              {r.marginPct != null ? `${formatNumber(r.marginPct, 1)}% doanh thu` : '--'}
            </span>
          </span>
          <span className={`text-2xl font-bold tabular-nums ${profitTone}`}>{vnd(r.profit)}</span>
        </div>
      </div>

      {(hasUnsettledFile || (r.hasAds && r.gmvInSettlement > 0)) && (
        <div className="space-y-1 border-t border-line p-2">
          {hasUnsettledFile && (
            <Toggle
              on={options.includeUnsettled}
              label="Tính cả đơn chờ quyết toán"
              hint="Dùng số ước tính trong file chờ quyết toán cho đơn TikTok chưa trả tiền."
              onChange={(v) => onOptions({ ...options, includeUnsettled: v })}
            />
          )}
          {r.hasAds && r.gmvInSettlement > 0 && (
            <Toggle
              on={options.dedupeGmvMax}
              label="Không tính 2 lần phí GMV Max"
              hint={`Quyết toán đã trừ ${vnd(r.gmvInSettlement)} phí GMV Max → bớt phần này khỏi chi phí file quảng cáo. Tắt nếu shop trả quảng cáo bằng thẻ / số dư riêng.`}
              onChange={(v) => onOptions({ ...options, dedupeGmvMax: v })}
            />
          )}
        </div>
      )}
    </Card>
  );
}
