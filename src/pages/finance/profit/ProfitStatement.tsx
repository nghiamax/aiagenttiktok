import Card from '../../../components/ui/Card';
import { formatNumber } from '../../../lib/format';
import type { ProfitOptions, ProfitResult } from './profitCalc';

interface ProfitStatementProps {
  result: ProfitResult;
  options: ProfitOptions;
  hasUnsettledFile: boolean;
  onOptions: (o: ProfitOptions) => void;
  platform?: 'tiktok' | 'shopee';
  /** TikTok: so sánh có / không đăng ký chương trình Hoàn phí vận chuyển (file có khoản của chương trình) */
  sfrCompare?: { fee: number; refund: number; orders: number; enrolledProfit: number; notEnrolledProfit: number };
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
export default function ProfitStatement({
  result: r,
  options,
  hasUnsettledFile,
  onOptions,
  platform = 'tiktok',
  sfrCompare,
}: ProfitStatementProps) {
  const payout = r.settled + r.unsettled;
  const diff = payout - r.revenue - r.fees;
  const profitTone = r.profit < 0 ? 'text-danger' : 'text-accent-green';

  return (
    <Card className="overflow-hidden">
      <div className="px-5 pb-2 pt-5">
        <h3 className="font-semibold">Lãi lỗ thực tế</h3>
        <p className="mt-0.5 text-sm text-muted">
          {platform === 'shopee'
            ? r.basis === 'payment'
              ? 'Theo file "Đã thanh toán": tổng số tiền của file Income + file Shopee Xử Lý − điều chỉnh (trang Adjustment) = tiền thực về tài khoản.'
              : r.hasSettled
                ? 'Đơn đặt trong kỳ: số Shopee thực trả; đơn chưa thanh toán dùng số ước tính từ file đơn hàng.'
                : 'Ước tính từ file đơn hàng Shopee: tiền hàng − mã giảm giá của shop − các khoản phí ghi trong file.'
            : 'Số theo file quyết toán của TikTok, không ước lượng phí.'}
        </p>
      </div>
      <div className="divide-y divide-line">
        <Line sign="" label="Doanh thu hàng hoá" sub="Sau giảm giá của shop, đã trừ hoàn tiền" amount={r.revenue} />
        <Line sign="−" label="Phí sàn & khấu trừ" sub="Chi tiết ở khung bên cạnh" amount={r.fees} />
        {Math.abs(diff) >= 1 && (
          <Line
            sign="+"
            label="Điều chỉnh khác"
            sub={
              r.adjustmentLines.length
                ? r.adjustmentLines.map((a) => `${a.label} (${formatNumber(a.count)}): ${vnd(a.amount)}`).join(' · ')
                : platform === 'shopee'
                  ? 'Bồi hoàn, điều chỉnh'
                  : 'Bồi hoàn, điều chỉnh của TikTok'
            }
            amount={diff}
          />
        )}
        <Line
          sign="="
          strong
          label="Tiền về"
          sub={
            r.unsettled
              ? `Đã về ${vnd(r.settled)} · chờ về ${vnd(r.unsettled)} (ước tính)`
              : r.adsTopup.count && !r.adsTopup.counted
                ? 'Tiền bán hàng, chưa trừ khoản nạp ví quảng cáo bên dưới'
                : 'Tổng số tiền quyết toán'
          }
          amount={payout}
        />
        {r.adsTopup.count > 0 && !r.adsTopup.counted && (
          <div className="flex items-start gap-3 bg-canvas/60 px-5 py-2.5 text-sm text-muted">
            <span className="w-3 shrink-0 text-center">i</span>
            <span className="min-w-0 flex-1">
              Nạp ví quảng cáo từ số dư ("GMV thanh toán cho Quảng cáo TikTok", {formatNumber(r.adsTopup.count)} lần):{' '}
              <b className="text-ink tabular-nums">{vnd(r.adsTopup.amount)}</b> — không trừ thêm, vì chi phí quảng cáo
              đã lấy theo file quảng cáo (tránh tính 2 lần).
            </span>
          </div>
        )}
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
            sub={r.otherLines.map((l) => `${l.label || 'Khác'} ${vnd(l.amount)}`).join(' · ')}
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

      {platform === 'shopee' && r.hasSettled && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3 text-sm">
          <span className="text-muted">Kỳ tính:</span>
          <div className="inline-flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label="Kỳ tính">
            {(
              [
                ['payment', 'Theo ngày Shopee trả tiền', 'Khớp báo cáo thu nhập tháng của Shopee'],
                ['order', 'Theo ngày đặt đơn', 'Đơn đặt trong kỳ của file đơn hàng (đơn chưa trả dùng số ước tính)'],
              ] as const
            ).map(([v, label, hint]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={r.basis === v}
                title={hint}
                onClick={() => onOptions({ ...options, basis: v })}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  r.basis === v ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-canvas hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {sfrCompare && (
        <div className="border-t border-line p-2">
          <Toggle
            on={options.sfrEnrolled !== false}
            label="Đăng ký chương trình Hoàn phí vận chuyển"
            hint={`Phí SFR ${vnd(sfrCompare.fee)} (${formatNumber(sfrCompare.orders)} đơn) · được hoàn ${vnd(sfrCompare.refund)} cho đơn trả / giao không thành công. Tắt = tính thử nếu không đăng ký.`}
            onChange={(v) => onOptions({ ...options, sfrEnrolled: v })}
          />
          <div className="mx-3 mb-1 mt-1 grid grid-cols-2 gap-2 text-sm">
            {(
              [
                ['Có đăng ký', sfrCompare.enrolledProfit, options.sfrEnrolled !== false],
                ['Không đăng ký', sfrCompare.notEnrolledProfit, options.sfrEnrolled === false],
              ] as const
            ).map(([label, profit, active]) => (
              <div
                key={label}
                className={`rounded-lg border px-3 py-2 ${active ? 'border-primary bg-primary-soft/40' : 'border-line'}`}
              >
                <span className="block text-muted">{label}</span>
                <b className={`tabular-nums ${profit < 0 ? 'text-danger' : 'text-ink'}`}>{vnd(profit)}</b>
              </div>
            ))}
          </div>
          <p className="mx-3 mb-1 text-sm text-muted">
            {(() => {
              const d = sfrCompare.enrolledProfit - sfrCompare.notEnrolledProfit;
              return Math.abs(d) < 1
                ? 'Đăng ký hay không, lợi nhuận như nhau.'
                : d > 0
                  ? `Đăng ký lời hơn ${vnd(d)} (tiền hoàn lớn hơn phí).`
                  : `Không đăng ký lời hơn ${vnd(-d)} (phí lớn hơn tiền được hoàn).`;
            })()}{' '}
            Tính trên số thật trong file — chưa tính rủi ro đơn trả hàng tăng / giảm sau này.
          </p>
        </div>
      )}
      {(hasUnsettledFile || (r.hasAds && (r.gmvInSettlement > 0 || r.adsTopup.count > 0))) && (
        <div className="space-y-1 border-t border-line p-2">
          {hasUnsettledFile && (
            <Toggle
              on={options.includeUnsettled}
              label={platform === 'shopee' ? 'Tính cả đơn chưa thanh toán (ước tính)' : 'Tính cả đơn chờ quyết toán'}
              hint={
                platform === 'shopee'
                  ? 'Đơn chưa có trong file "Đã thanh toán" → dùng số ước tính từ file đơn hàng.'
                  : 'Dùng số ước tính trong file chờ quyết toán cho đơn TikTok chưa trả tiền.'
              }
              onChange={(v) => onOptions({ ...options, includeUnsettled: v })}
            />
          )}
          {r.hasAds && (r.gmvInSettlement > 0 || r.adsTopup.count > 0) && (
            <Toggle
              on={options.dedupeGmvMax}
              label="Không tính 2 lần chi phí quảng cáo"
              hint={[
                r.gmvInSettlement > 0 &&
                  `Quyết toán đã trừ ${vnd(r.gmvInSettlement)} phí GMV Max → bớt khỏi chi phí file quảng cáo.`,
                r.adsTopup.count > 0 &&
                  `Tiền nạp ví quảng cáo từ số dư (${vnd(r.adsTopup.amount)}) không trừ thêm — chi phí lấy theo file quảng cáo.`,
                'Tắt nếu muốn trừ cả 2.',
              ]
                .filter(Boolean)
                .join(' ')}
              onChange={(v) => onOptions({ ...options, dedupeGmvMax: v })}
            />
          )}
        </div>
      )}
    </Card>
  );
}
