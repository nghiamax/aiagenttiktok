import { Info } from 'lucide-react';
import { formatNumber, formatShortDate } from '../../../../lib/format';
import { shortVnd } from '../../classify';
import type { MetricWindow } from '../types';

interface MetricWindowBoxProps {
  title: string;
  window: MetricWindow | null;
  /** So ROI với khoảng này (hiện ▲▼) */
  compareTo?: MetricWindow;
  /** Ghi chú khi chưa có số / chưa đủ thời gian đánh giá */
  pendingText?: string;
  hint?: string;
}

const money = (n: number | null) => (n == null ? '--' : shortVnd(n));

/** Ô số liệu: Chi · DT · ROI / hoà vốn · đơn trong một khoảng thời gian */
export default function MetricWindowBox({ title, window: w, compareTo, pendingText, hint }: MetricWindowBoxProps) {
  const delta = w?.roi != null && compareTo?.roi != null ? w.roi - compareTo.roi : null;
  const belowBreakEven = w?.roi != null && w.breakEven != null && w.roi < w.breakEven;

  return (
    <div className="min-w-0 rounded-xl bg-canvas/70 px-3 py-2.5">
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {title}
        {hint && (
          <span title={hint} className="cursor-help">
            <Info className="size-3.5" />
          </span>
        )}
      </p>
      {!w || pendingText ? (
        <p className="mt-1 text-sm text-muted">{pendingText ?? 'Chưa có số liệu'}</p>
      ) : (
        <>
          <p className="mt-1 text-sm tabular-nums">
            Chi {money(w.cost)} · DT {money(w.revenue)} ·{' '}
            <b className={belowBreakEven ? 'text-danger' : ''}>ROI {formatNumber(w.roi, 2)}</b>
            {delta != null && delta !== 0 && (
              <span className={delta < 0 ? 'text-danger' : 'text-accent-green'}>
                {' '}
                ({delta < 0 ? '▼' : '▲'} {formatNumber(Math.abs(delta), 2)})
              </span>
            )}
            {w.breakEven != null && <span className="text-muted"> / hv {formatNumber(w.breakEven, 2)}</span>} ·{' '}
            {formatNumber(w.orders)} đơn
          </p>
          <p className="text-xs text-muted">
            {formatShortDate(w.from)} → {formatShortDate(w.to)}
          </p>
        </>
      )}
    </div>
  );
}
