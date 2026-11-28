import { useState } from 'react';
import { RefreshCw, RotateCw, Undo2 } from 'lucide-react';
import { CREATIVE_MAX_RETRIES } from '../../../../../shared/agentPolicy';
import { formatDateTime } from '../../../../lib/format';
import { useAdsData } from '../../data';
import { useAuth } from '../../../../auth/AuthProvider';
import type { ExecOutcome } from '../agentStore';
import { canUndo, describeUndo, friendlyError } from '../execText';
import { ACTOR_META, STATUS_META } from '../meta';
import type { AgentActionLog } from '../types';
import { ActionCell, ITEM_GRID, TargetCell } from './AgentBits';
import { dayMonth, evaluateAction, firstAfterDate, firstAfterReadyAt, summarizeAction } from '../evaluate';
import AfterDaysStrip from './AfterDaysStrip';
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
  /** Gửi lại lệnh Gỡ / Thêm lại bị lỗi */
  onRetry: (actionId: string) => Promise<ExecOutcome>;
  /** Kiểm tra ngay kết quả gỡ / thêm video (chỉ đọc) */
  onVerify: (actionId: string) => Promise<ExecOutcome>;
  /** Mở từ link "Xem ở Nhật ký" → làm nổi dòng này */
  highlight?: boolean;
}

const DELAY_HINT = 'Đơn TikTok thường về trễ vài giờ nên số ngay sau thao tác có thể chưa đủ.';

/** Một dòng nhật ký: thời gian · hành động · đối tượng · lúc quyết định → sau thao tác · trạng thái */
export default function ActionLogItem({ item, all, ruleName, evaluateAfterHours, proposedAt, onUndo, onRetry, onVerify, highlight }: ActionLogItemProps) {
  const { snapshot } = useAdsData();
  const [confirming, setConfirming] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [result, setResult] = useState<ExecOutcome | null>(null);
  const [checking, setChecking] = useState(false);
  const actor = ACTOR_META[item.actor];
  const status = STATUS_META[item.status];
  const ev = evaluateAction(item, evaluateAfterHours);
  const summary = summarizeAction(item, ev);
  // Câu chờ duy nhất: Ngày 1 = ngày lịch kế sau ngày thao tác, hiện khi tròn 24h
  const readyAt = firstAfterReadyAt(item.executedAt);
  const day1 = dayMonth(firstAfterDate(item.executedAt));
  const waitText =
    item.status === 'failed'
      ? 'Không đo — lệnh chưa chạy trên TikTok'
      : item.measureStop
        ? `Không đo — ${item.measureStop.reason}`
      : item.actionType === 'remind'
        ? 'Nhắc việc — không đo'
        : item.status === 'running'
          ? 'Đo sau khi TikTok xác nhận xong'
          : Date.now() < readyAt
            ? `Có số ngày ${day1} lúc ~${formatDateTime(new Date(readyAt).toISOString())}`
            : `Đang lấy số ngày ${day1} từ TikTok…`;
  const canExec = useAuth().can('execute');
  const undoable = canExec && canUndo(item, all);
  // Gửi lại (Sếp chốt 27/11): dòng gỡ / thêm lại bị lỗi, chưa có lần gửi lại thành công / đang chạy, tối đa CREATIVE_MAX_RETRIES lần
  const retryRoot = item.retryOf ?? item.id;
  const retries = all.filter((x) => x.retryOf === retryRoot);
  const retryLeft = Math.max(0, CREATIVE_MAX_RETRIES - retries.length);
  const isCreative = item.actionType === 'remove_creative' || item.actionType === 'add_creative';
  const latestTry = [item, ...retries].sort((a, b) => b.executedAt.localeCompare(a.executedAt))[0];
  const retryable =
    canExec && isCreative && item.status === 'failed' && latestTry.id === item.id && !retries.some((x) => x.status !== 'failed');
  const retryVerb = item.actionType === 'remove_creative' ? 'gỡ' : 'thêm lại';
  // Người bấm: dòng có tên (sau khi có đăng nhập) → "Duyệt bởi …"; dòng cũ giữ nhãn cũ
  const actorText = item.undoOf
    ? `Hoàn tác${item.by ? ` · ${item.by.name}` : ''}`
    : item.actor === 'agent'
      ? actor.label // BOT tự chạy (by = BOT AI) — trước đây rơi vào "Thủ công · BOT AI"
      : item.by
      ? item.actor === 'approved'
        ? `Duyệt bởi ${item.by.name}`
        : `Thủ công · ${item.by.name}`
      : actor.label;

  return (
    <li
      id={`log-${item.id}`}
      className={`${ITEM_GRID} scroll-mt-20 transition-colors duration-700 ${highlight ? 'bg-primary-soft ring-2 ring-inset ring-primary' : 'hover:bg-canvas/50'}`}
    >
      <div>
        <p className="text-sm font-semibold tabular-nums">{formatDateTime(item.executedAt)}</p>
        <p className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${actor.className}`}>
          <actor.icon className="size-3.5" />
          {actorText}
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
          pendingText={item.after ? undefined : waitText}
        />
        <AfterDaysStrip item={item} summary={summary} />
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
        {item.status === 'running' && canExec && (
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
        {retryable &&
          (retryLeft > 0 ? (
            <button
              type="button"
              onClick={() => setRetrying(true)}
              className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-canvas hover:text-ink"
            >
              <RotateCw className="size-3.5" />
              Gửi lại (còn {retryLeft} lần)
            </button>
          ) : (
            <p className="max-w-xs text-xs text-danger lg:text-right">
              Đã gửi lại {CREATIVE_MAX_RETRIES} lần mà TikTok vẫn chưa nhận — làm tay trên Ads Manager hoặc liên hệ hỗ trợ TikTok
            </p>
          ))}
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

      {retrying && (
        <ConfirmExecuteModal
          title={`Gửi lại lệnh ${retryVerb} video lên TikTok?`}
          lines={[
            `Gửi lại lệnh ${retryVerb} video ${item.target.videoId}. Server đọc trạng thái mới nhất trước — TikTok đã làm rồi thì không gửi.`,
          ]}
          confirmLabel="Gửi lại"
          onConfirm={async () => setResult(await onRetry(item.id))}
          onClose={() => setRetrying(false)}
        />
      )}

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
