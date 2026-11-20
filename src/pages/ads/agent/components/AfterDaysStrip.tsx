import { formatNumber } from '../../../../lib/format';
import { dayMonth, vnDateOf, type ActionSummaryLine } from '../evaluate';
import type { AgentActionLog } from '../types';

interface AfterDaysStripProps {
  item: AgentActionLog;
  summary: ActionSummaryLine | null;
}

const DAY = 86_400_000;
const roiText = (r: number | null) => (r == null ? '--' : formatNumber(r, 2));
const TONE: Record<ActionSummaryLine['tone'], string> = {
  good: 'text-accent-green',
  bad: 'text-danger',
  muted: 'text-muted',
};

/** Dưới 2 ô số liệu: Trước (TB/ngày) · Ngày 1, Ngày 2… sau thao tác · câu kết luận */
export default function AfterDaysStrip({ item, summary }: AfterDaysStripProps) {
  const days = item.after?.days ?? [];
  // Chỉ hiện khi đã có ít nhất 1 ngày (câu chờ nằm trong ô "Sau thao tác")
  if (!summary || days.length === 0) return null;
  const bDays = Math.max(1, Math.round((Date.parse(item.before.to) - Date.parse(item.before.from)) / DAY));
  const bOrders = (item.before.orders ?? 0) / bDays;
  const today = vnDateOf(Date.now());

  return (
    <div className="space-y-1.5 sm:col-span-2">
      {(
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-lg bg-canvas px-2 py-1 text-muted">
            Trước (TB/ngày): ROI {roiText(item.before.roi)} · {formatNumber(bOrders, 1)} đơn
          </span>
          {days.map((d, i) => {
            const live = d.date >= today;
            return (
              <span
                key={d.date}
                className={`rounded-lg border px-2 py-1 tabular-nums ${live ? 'border-dashed border-primary/40' : 'border-line'}`}
                title={`Cả ngày ${dayMonth(d.date)}${live ? ' — đang chạy, số còn tăng' : ''}\nChi ${formatNumber(d.cost)}đ · DT ${formatNumber(d.revenue)}đ`}
              >
                <span className="text-muted">
                  Ngày {i + 1} · {dayMonth(d.date)}
                  {live && <span className="text-primary"> (đang chạy)</span>}:
                </span>{' '}
                ROI {roiText(d.roi)} · {formatNumber(d.orders)} đơn
              </span>
            );
          })}
        </div>
      )}
      {item.measureStop && (
        <p className="text-xs text-muted">
          Dừng đo từ {dayMonth(item.measureStop.date)}: {item.measureStop.reason} — chỉ chấm các ngày trước đó.
        </p>
      )}
      <p className={`text-sm font-medium ${TONE[summary.tone]}`}>{summary.text}</p>
    </div>
  );
}
