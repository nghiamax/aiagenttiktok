import { CircleCheck, CircleHelp, CircleX, Clock } from 'lucide-react';
import { shortVnd } from '../../../../lib/format';
import type { ActionEvaluation } from '../evaluate';

const META = {
  good: { label: 'Đúng', icon: CircleCheck, className: 'bg-green-50 text-accent-green' },
  bad: { label: 'Sai', icon: CircleX, className: 'bg-rose-50 text-danger' },
  pending: { label: 'Chờ đánh giá', icon: Clock, className: 'bg-blue-50 text-primary' },
  insufficient: { label: 'Chưa đủ số liệu', icon: Clock, className: 'bg-canvas text-muted' },
  unscorable: { label: 'Chưa chấm được', icon: CircleHelp, className: 'bg-canvas text-muted' },
} as const;

/** "+120k" / "−45k" */
export function signedVnd(n: number): string {
  return `${n >= 0 ? '+' : '−'}${shortVnd(Math.abs(n))}`;
}

/** Nhãn kết quả thao tác + lợi nhuận tác động (ước tính) */
export default function VerdictBadge({ ev }: { ev: ActionEvaluation }) {
  if (ev.verdict === 'excluded') return null;
  const meta = META[ev.verdict];
  const title =
    ev.verdict === 'unscorable'
      ? 'Thiếu ROI hoà vốn lúc quyết định nên chưa tính được lời/lỗ'
      : ev.verdict === 'pending'
        ? 'Chưa đủ thời gian hoặc chưa có số liệu sau thao tác'
        : ev.verdict === 'insufficient'
          ? 'Chi tiêu / số đơn thay đổi quá ít so với trước — chờ thêm ngày để chấm'
          : 'Lãi/lỗ QC thay đổi so với trước thao tác (ước tính)';
  return (
    <span className="flex flex-wrap items-center gap-1.5" title={title}>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.className}`}>
        <meta.icon className="size-3.5" />
        {meta.label}
      </span>
      {ev.profitEffect != null && (
        <span className={`text-xs font-semibold tabular-nums ${ev.profitEffect >= 0 ? 'text-accent-green' : 'text-danger'}`}>
          {signedVnd(ev.profitEffect)}
        </span>
      )}
    </span>
  );
}
