import { formatNumber } from '../../../../lib/format';
import type { ActionSummaryLine } from '../evaluate';
import type { AgentActionLog } from '../types';

interface AfterDaysStripProps {
  item: AgentActionLog;
  summary: ActionSummaryLine | null;
}

const DAY = 86_400_000;
const roiText = (r: number | null) => (r == null ? '--' : formatNumber(r, 2));
/** "15:00 20/11" theo giờ máy */
const hm = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
};
const TONE: Record<ActionSummaryLine['tone'], string> = {
  good: 'text-accent-green',
  bad: 'text-danger',
  muted: 'text-muted',
};

/** Dưới 2 ô số liệu: Trước (TB/ngày) · Ngày 1, Ngày 2… sau thao tác · câu kết luận */
export default function AfterDaysStrip({ item, summary }: AfterDaysStripProps) {
  const days = item.after?.days ?? [];
  // Chỉ hiện khi đã có ít nhất 1 khối 24h (câu chờ nằm trong ô "Sau thao tác")
  if (!summary || days.length === 0) return null;
  const bDays = Math.max(1, Math.round((Date.parse(item.before.to) - Date.parse(item.before.from)) / DAY));
  const bOrders = (item.before.orders ?? 0) / bDays;

  return (
    <div className="space-y-1.5 sm:col-span-2">
      {(
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-lg bg-canvas px-2 py-1 text-muted">
            Trước (TB/ngày): ROI {roiText(item.before.roi)} · {formatNumber(bOrders, 1)} đơn
          </span>
          {days.map((d, i) => (
            <span
              key={d.from ?? d.date}
              className="rounded-lg border border-line px-2 py-1 tabular-nums"
              title={`${d.from ? `${hm(d.from)} → ` : ''}${d.to ? hm(d.to) : d.date}\nChi ${formatNumber(d.cost)}đ · DT ${formatNumber(d.revenue)}đ`}
            >
              <span className="text-muted">
                Ngày {i + 1}{d.to ? ` (đến ${hm(d.to)})` : ''}:
              </span>{' '}
              ROI {roiText(d.roi)} · {formatNumber(d.orders)} đơn
            </span>
          ))}
        </div>
      )}
      <p className={`text-sm font-medium ${TONE[summary.tone]}`}>{summary.text}</p>
    </div>
  );
}
