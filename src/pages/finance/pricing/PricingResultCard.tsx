import { AlertTriangle, ReceiptText } from 'lucide-react';
import Card from '../../../components/ui/Card';
import { formatNumber } from '../../../lib/format';
import type { PricingResult } from './calc';
import type { PricingMode } from './config';

interface PricingResultCardProps {
  mode: PricingMode;
  result: PricingResult | null;
  /** Giá chưa làm tròn (chế độ tìm giá bán) */
  exactPrice: number | null;
  /** Mục tiêu lãi, vd "10%" hoặc "30.000đ / sp" */
  targetLabel: string;
  /** Lý do không tính được (vd tổng % phí ≥ 100%) */
  error: string | null;
  warnings: string[];
  /** Vd "TikTok Shop · Shop tiêu chuẩn · Tai nghe (10,5%)" */
  context: string;
}

const vnd = (v: number) => `${formatNumber(Math.round(v))}đ`;
const pct = (v: number | null) => (v == null ? '--' : `${formatNumber(v, 1)}%`);

interface Slice {
  key: string;
  label: string;
  amount: number;
  color: string;
}

/** Gom các khoản thành 5 phần để vẽ thanh cơ cấu giá bán */
function slices(r: PricingResult): Slice[] {
  const sum = (ids: (id: string) => boolean) => r.deductions.filter((d) => ids(d.id)).reduce((s, d) => s + d.amount, 0);
  const cost = r.netReceived - r.profit;
  return [
    { key: 'cost', label: 'Giá vốn', amount: cost, color: 'bg-muted' },
    {
      key: 'platform',
      label: 'Phí sàn',
      amount: sum((id) => id !== 'ads' && id !== 'tax' && id !== 'affiliate'),
      color: 'bg-accent-violet',
    },
    { key: 'affiliate', label: 'Hoa hồng KOC', amount: sum((id) => id === 'affiliate'), color: 'bg-accent-violet/40' },
    { key: 'ads', label: 'Quảng cáo', amount: sum((id) => id === 'ads'), color: 'bg-primary' },
    { key: 'tax', label: 'Thuế', amount: sum((id) => id === 'tax'), color: 'bg-amber-400' },
    {
      key: 'profit',
      label: r.profit >= 0 ? 'Lãi' : 'Lỗ',
      amount: Math.abs(r.profit),
      color: r.profit >= 0 ? 'bg-accent-green' : 'bg-danger',
    },
  ].filter((s) => s.amount > 0);
}

export default function PricingResultCard({
  mode,
  result,
  exactPrice,
  targetLabel,
  error,
  warnings,
  context,
}: PricingResultCardProps) {
  const profitable = result ? result.profit >= 0 : true;
  const parts = result ? slices(result) : [];
  const total = parts.reduce((s, p) => s + p.amount, 0);

  return (
    <Card className="overflow-hidden">
      <div className="bg-ink px-3.5 py-3 text-white">
        <p className="mb-1 truncate text-[13px] text-white/50" title={context}>
          {context}
        </p>
        <p className="text-[13px] text-white/60">{mode === 'price' ? 'Giá bán đề xuất' : 'Lãi mỗi sản phẩm'}</p>
        {result ? (
          <>
            <p
              className={`text-2xl font-bold leading-tight tracking-tight tabular-nums ${
                mode === 'profit' && !profitable ? 'text-rose-300' : ''
              }`}
            >
              {mode === 'price' ? vnd(result.price) : vnd(result.profit)}
            </p>
            <p className="mt-0.5 text-[13px] text-white/70">
              {mode === 'price'
                ? `Lãi ${vnd(result.profit)} · ${pct(result.marginPct)} giá bán (mục tiêu ${targetLabel})`
                : `${pct(result.marginPct)} giá bán · ${pct(result.markupPct)} giá vốn`}
            </p>
            <p className="text-[13px] text-white/50">
              Hoà vốn {result.breakEvenPrice != null ? vnd(result.breakEvenPrice) : '--'}
              {mode === 'price' &&
                exactPrice != null &&
                Math.round(exactPrice) !== result.price &&
                ` · giá đúng ${vnd(exactPrice)}, làm tròn lên 1.000đ`}
            </p>
          </>
        ) : (
          <p className="text-2xl font-bold text-white/30">--</p>
        )}
      </div>

      <div className="p-3">
        {error ? (
          <div className="flex gap-2.5 rounded-xl bg-danger/5 p-4 text-danger">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <p>{error}</p>
          </div>
        ) : !result ? (
          <p className="text-muted">
            {mode === 'price' ? 'Nhập giá vốn để tính giá bán.' : 'Nhập giá bán và giá vốn để xem lãi.'}
          </p>
        ) : (
          <>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden="true">
              {parts.map((p) => (
                <div key={p.key} className={p.color} style={{ width: `${(p.amount / total) * 100}%` }} />
              ))}
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-x-2.5 text-[13px] leading-5" aria-label="Cơ cấu giá bán">
              {parts.map((p) => (
                <li key={p.key} className="flex items-center gap-1">
                  <span className={`size-1.5 shrink-0 rounded-full ${p.color}`} />
                  <span className="text-muted">{p.label}</span>
                  <span className="font-medium tabular-nums">
                    {result.price > 0 ? `${formatNumber((p.amount / result.price) * 100, 1)}%` : '--'}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-2 rounded-xl border border-line">
              <p className="flex items-center gap-1.5 border-b border-line px-2.5 py-1 text-[13px] font-medium text-muted">
                <ReceiptText className="size-3.5" /> Chi tiết từng khoản
              </p>
              <dl className="px-2.5 py-0.5 text-[13px] leading-[1.35rem]">
                <div className="flex justify-between font-semibold">
                  <dt>Giá bán</dt>
                  <dd className="tabular-nums">{vnd(result.price)}</dd>
                </div>
                {result.deductions.map((d) => (
                  <div key={d.id} className="flex justify-between gap-3">
                    <dt className="flex min-w-0 text-muted" title={d.label}>
                      <span className="truncate">{d.label}</span>
                      {d.pct != null && (
                        <span className="ml-1 shrink-0 text-muted/70">({formatNumber(d.pct, 2)}%)</span>
                      )}
                    </dt>
                    <dd className="shrink-0 tabular-nums">−{vnd(d.amount)}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t border-dashed border-line font-semibold">
                  <dt>Tiền về</dt>
                  <dd className="tabular-nums">{vnd(result.netReceived)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Giá vốn</dt>
                  <dd className="tabular-nums">−{vnd(result.netReceived - result.profit)}</dd>
                </div>
                <div
                  className={`flex justify-between border-t border-line text-sm font-bold leading-7 ${
                    profitable ? 'text-accent-green' : 'text-danger'
                  }`}
                >
                  <dt>{profitable ? 'Lãi' : 'Lỗ'}</dt>
                  <dd className="tabular-nums">{vnd(result.profit)}</dd>
                </div>
              </dl>
            </div>
          </>
        )}

        {warnings.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[13px] text-muted">
            {warnings.map((w) => (
              <li key={w} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                {w}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
