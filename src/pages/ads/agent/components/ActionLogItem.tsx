import { useState } from 'react';
import { RefreshCw, Undo2 } from 'lucide-react';
import { formatDateTime } from '../../../../lib/format';
import { useAdsData } from '../../data';
import type { ExecOutcome } from '../agentStore';
import { canUndo, describeUndo, friendlyError } from '../execText';
import { ACTOR_META, STATUS_META } from '../meta';
import type { AgentActionLog } from '../types';
import { ActionCell, ITEM_GRID, TargetCell } from './AgentBits';
import { evaluateAction } from '../evaluate';
import ConfirmExecuteModal from './ConfirmExecuteModal';
import MetricWindowBox from './MetricWindowBox';
import VerdictBadge from './VerdictBadge';

interface ActionLogItemProps {
  item: AgentActionLog;
  /** Toàn bộ nhật ký (biết thao tác đã được hoàn tác chưa) */
  all: AgentActionLog[];
  ruleName: string | null;
  evaluateAfterHours: number;
  /** Thời điểm Agent đề xuất (dòng Sếp duyệt) */
  proposedAt?: string;
  onUndo: (actionId: string) => Promise<ExecOutcome>;
  /** Kiểm tra ngay kết quả gỡ / thêm video (chỉ đọc) */
  onVerify: (actionId: string) => Promise<ExecOutcome>;
}

const DELAY_HINT = 'Đơn TikTok thường về trễ vài giờ nên số ngay sau thao tác có thể chưa đủ.';

/** Một dòng nhật ký: thời gian · hành động · đối tượng · lúc quyết định → sau thao tác · trạng thái */
export default function ActionLogItem({ item, all, ruleName, evaluateAfterHours, proposedAt, onUndo, onVerify }: ActionLogItemProps) {
  const { snapshot } = useAdsData();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ExecOutcome | null>(null);
  const [checking, setChecking] = useState(false);
  const actor = ACTOR_META[item.actor];
  const status = STATUS_META[item.status];
  const hoursSince = (Date.now() - new Date(item.executedAt).getTime()) / 3_600_000;
  const tooSoon = hoursSince < evaluateAfterHours;
  const ev = evaluateAction(item, evaluateAfterHours);
  const undoable = canUndo(item, all);

  return (
    <li className={`${ITEM_GRID} transition-colors hover:bg-canvas/50`}>
      <div>
        <p className="text-sm font-semibold tabular-nums">{formatDateTime(item.executedAt)}</p>
        <p className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${actor.className}`}>
          <actor.icon className="size-3.5" />
          {item.undoOf ? 'Hoàn tác' : actor.label}
        </p>
        {proposedAt && <p className="mt-0.5 text-xs text-muted">Đề xuất lúc {formatDateTime(proposedAt)}</p>}
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

      <div className="flex flex-row flex-wrap items-center justify-between gap-2 lg:flex-col lg:items-end">
        <p className={`flex items-center gap-1.5 text-sm font-semibold ${status.className}`}>
          <status.icon className={`size-4 ${item.status === 'running' ? 'animate-spin' : ''}`} />
          {item.status === 'running' ? (item.note ?? 'Chờ TikTok xác nhận') : status.label}
        </p>
        {item.status !== 'running' && item.note && <p className="text-xs text-muted lg:text-right">{item.note}</p>}
        {item.error && (
          <p title={item.error} className="max-w-xs break-words text-xs text-danger lg:text-right">
            {friendlyError(item.error)}
          </p>
        )}
        <VerdictBadge ev={ev} />
        {item.status === 'running' && (
          <button
            type="button"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              setResult(await onVerify(item.id));
              setChecking(false);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-canvas hover:text-ink disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`size-3.5 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Đang kiểm tra…' : 'Kiểm tra ngay'}
          </button>
        )}
        {undoable && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-canvas hover:text-ink"
          >
            <Undo2 className="size-3.5" />
            Hoàn tác
          </button>
        )}
        {item.status === 'success' && item.actionType === 'boost_creative' && (
          <p className="text-xs text-muted lg:text-right">Không hoàn tác được — tự kết thúc khi hết số ngày</p>
        )}
        {result && <p className={`text-xs lg:text-right ${result.ok ? 'text-accent-green' : 'text-danger'}`}>{result.message}</p>}
      </div>

      {confirming && (
        <ConfirmExecuteModal
          title="Hoàn tác trên TikTok?"
          lines={[describeUndo(snapshot, item)]}
          confirmLabel="Xác nhận"
          onConfirm={async () => setResult(await onUndo(item.id))}
          onClose={() => setConfirming(false)}
        />
      )}
    </li>
  );
}
