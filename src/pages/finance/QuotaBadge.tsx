import { Crown } from 'lucide-react';
import { formatNumber } from '../../lib/format';
import { useFinanceQuota } from './useFinanceQuota';

const dateVi = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

/** Gói + lượt còn lại (góc phải tiêu đề trang Tài chính): Tính giá bán = lượt tính, Tính lợi nhuận = số đơn */
export default function QuotaBadge({ kind = 'pricing' }: { kind?: 'pricing' | 'profit' }) {
  const { quota } = useFinanceQuota();
  if (!quota) return null;
  if (quota.unlimited) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-accent-violet/10 px-3 py-2 text-sm font-semibold text-accent-violet">
        <Crown className="size-4" /> Gói Pro{quota.proUntil ? ` · đến ${dateVi(quota.proUntil)}` : ''}
      </span>
    );
  }
  const profit = kind === 'profit';
  const limit = (profit ? quota.profitLimit : quota.limit) ?? 0;
  const left = (profit ? quota.profitRemaining : quota.remaining) ?? 0;
  const used = profit ? quota.profitUsed : quota.used;
  const pct = limit ? Math.min(100, (used / limit) * 100) : 100;
  return (
    <div className="w-60 rounded-xl border border-line bg-white px-3 py-2">
      <p className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">Gói Miễn phí</span>
        <span className={left === 0 ? 'font-semibold text-danger' : 'text-muted'}>
          còn <b className={left === 0 ? '' : 'text-ink'}>{formatNumber(left)}</b>/{formatNumber(limit)}{' '}
          {profit ? 'đơn' : 'lượt'}
        </span>
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden="true">
        <div
          className={`h-full rounded-full ${left === 0 ? 'bg-danger' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
