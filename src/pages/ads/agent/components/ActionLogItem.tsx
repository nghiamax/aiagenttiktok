import { Undo2 } from 'lucide-react';
import { formatDateTime } from '../../../../lib/format';
import { ACTOR_META, STATUS_META } from '../meta';
import type { AgentActionLog } from '../types';
import { ActionCell, ITEM_GRID, TargetCell } from './AgentBits';
import { evaluateAction } from '../evaluate';
import MetricWindowBox from './MetricWindowBox';
import VerdictBadge from './VerdictBadge';

interface ActionLogItemProps {
  item: AgentActionLog;
  ruleName: string | null;
  evaluateAfterHours: number;
}

const DELAY_HINT = 'Đơn TikTok thường về trễ vài giờ nên số ngay sau thao tác có thể chưa đủ.';

/** Một dòng nhật ký: thời gian · hành động · đối tượng · lúc quyết định → sau thao tác · trạng thái */
export default function ActionLogItem({ item, ruleName, evaluateAfterHours }: ActionLogItemProps) {
  const actor = ACTOR_META[item.actor];
  const status = STATUS_META[item.status];
  const hoursSince = (Date.now() - new Date(item.executedAt).getTime()) / 3_600_000;
  const tooSoon = hoursSince < evaluateAfterHours;
  const ev = evaluateAction(item, evaluateAfterHours);

  return (
    <li className={`${ITEM_GRID} transition-colors hover:bg-canvas/50`}>
      <div>
        <p className="text-sm font-semibold tabular-nums">{formatDateTime(item.executedAt)}</p>
        <p className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${actor.className}`}>
          <actor.icon className="size-3.5" />
          {actor.label}
        </p>
      </div>

      <ActionCell actionType={item.actionType} ruleName={ruleName} params={item.params} />
      <TargetCell target={item.target} />

      <div className="grid gap-2 sm:grid-cols-2">
        <MetricWindowBox title="Lúc quyết định" window={item.before} />
        <MetricWindowBox
          title="Sau thao tác"
          window={item.after}
          compareTo={item.before}
          hint={DELAY_HINT}
          pendingText={tooSoon ? `Chờ đủ ${evaluateAfterHours}h để đánh giá` : undefined}
        />
      </div>

      <div className="flex flex-row items-center justify-between gap-2 lg:flex-col lg:items-end">
        <p className={`flex items-center gap-1.5 text-sm font-semibold ${status.className}`}>
          <status.icon className="size-4" />
          {status.label}
        </p>
        {item.error && <p className="text-xs text-danger lg:text-right">{item.error}</p>}
        <VerdictBadge ev={ev} />
        {item.status === 'success' && item.actionType !== 'remind' && (
          <button
            type="button"
            disabled
            title="Hoàn tác · Chưa kết nối backend"
            className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted opacity-60"
          >
            <Undo2 className="size-3.5" />
            Hoàn tác
          </button>
        )}
      </div>
    </li>
  );
}
