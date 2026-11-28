import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Hourglass, Loader2, RefreshCw, RotateCw, Trash2, Undo2 } from 'lucide-react';
import { CREATIVE_MANUAL_VERIFY_HOURS, CREATIVE_MAX_RETRIES, CREATIVE_UNCONFIRMED_MIN } from '../../../../../shared/agentPolicy';
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
  /** Xoá dòng (chỉ ẩn) — không có = không được xoá */
  onDelete?: () => void;
}

const DELAY_HINT = 'Đơn TikTok thường về trễ vài giờ nên số ngay sau thao tác có thể chưa đủ.';

/** Một dòng nhật ký: thời gian · hành động · đối tượng · lúc quyết định → sau thao tác · trạng thái */
export default function ActionLogItem({ item, all, ruleName, evaluateAfterHours, proposedAt, onUndo, onRetry, onVerify, highlight, onDelete }: ActionLogItemProps) {
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
          ? 'Chờ TikTok xác nhận'
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
  // Gỡ / thêm lại (Sếp chốt 28/11): 0–3 phút "Đang chờ TikTok xác nhận", 3–90 phút "Chưa xác nhận" (vàng), quá 90 phút Lỗi
  const elapsedMin = (Date.now() - Date.parse(item.executedAt)) / 60_000;
  const waiting = isCreative && item.status === 'running';
  const unconfirmed = waiting && elapsedMin >= CREATIVE_UNCONFIRMED_MIN;
  const retryable =
    canExec &&
    isCreative &&
    (item.status === 'failed' || unconfirmed) &&
    latestTry.id === item.id &&
    !retries.some((x) => x.status !== 'failed' && x.id !== item.id);
  // Kiểm tra ngay: dòng đang chờ, hoặc dòng gỡ / thêm lại Lỗi trong 24 giờ (TikTok ghi nhận muộn → Thành công)
  const verifiable =
    canExec &&
    (item.status === 'running' ||
      (isCreative && item.status === 'failed' && elapsedMin < CREATIVE_MANUAL_VERIFY_HOURS * 60 && !retries.some((x) => x.status !== 'failed')));
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

      <div className="min-w-0">
        <ActionCell actionType={item.actionType} ruleName={ruleName} params={item.params} />
        <ReAddLink item={item} all={all} />
      </div>
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
        {waiting ? (
          <CreativeWaiting item={item} unconfirmed={unconfirmed} />
        ) : (
          <p className={`flex items-center gap-1.5 text-sm font-semibold ${status.className}`}>
            <status.icon className={`size-4 ${item.status === 'running' ? 'animate-spin' : ''}`} />
            {item.status === 'running' ? (item.note ?? 'Chờ TikTok xác nhận') : status.label}
          </p>
        )}
        {item.status !== 'running' && item.note && <p className="text-xs text-muted lg:text-right">{item.note}</p>}
        {item.error && (
          <p title={item.error} className="max-w-xs break-words text-xs text-danger lg:text-right">
            {friendlyError(item.error)}
          </p>
        )}
        <VerdictBadge ev={ev} />
        {verifiable && (
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
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Xoá dòng nhật ký"
            title="Xoá khỏi Nhật ký"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition hover:bg-rose-50 hover:text-danger"
          >
            <Trash2 className="size-3.5" />
            Xoá
          </button>
        )}
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

/** Gỡ sai ↔ Thêm lại (Sếp chốt 28/11): dòng thêm lại → link lần gỡ; dòng gỡ đã được thêm lại → link dòng thêm lại */
function ReAddLink({ item, all }: { item: AgentActionLog; all: AgentActionLog[] }) {
  const logLink = (id: string) => `/care-ads/product?view=log&log=${encodeURIComponent(id)}`;
  if (item.reAddOf) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-danger">Thêm lại vì gỡ sai — video có lãi</span>
        <Link to={logLink(item.reAddOf)} className="text-xs font-medium text-primary hover:text-primary-hover">
          Xem lần gỡ
        </Link>
      </div>
    );
  }
  if (item.actionType !== 'remove_creative') return null;
  const re = all.find((a) => a.reAddOf === item.id && a.status !== 'failed');
  if (!re) return null;
  return (
    <Link to={logLink(re.id)} className="mt-1.5 block text-xs font-medium text-primary hover:text-primary-hover">
      → Đã thêm lại lúc {formatDateTime(re.executedAt)}
    </Link>
  );
}

/** "14:18:42" */
const clock = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Gỡ / thêm lại đang chờ TikTok xác nhận (Sếp chốt 28/11): xanh 0–3 phút, vàng "Chưa xác nhận" 3–90 phút */
function CreativeWaiting({ item, unconfirmed }: { item: AgentActionLog; unconfirmed: boolean }) {
  const checked = item.verifyCount
    ? `Đã kiểm tra ${item.verifyCount} lần${item.lastCheckedAt ? ` · lần cuối ${clock(item.lastCheckedAt)}` : ''}`
    : null;
  if (unconfirmed) {
    return (
      <div className="max-w-xs space-y-1 lg:text-right">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-600 lg:justify-end">
          <Hourglass className="size-4" />
          Chưa xác nhận
        </p>
        <p className="text-xs text-amber-700">TikTok đã nhận lệnh, trạng thái sẽ cập nhật sớm, bạn không cần làm gì thêm</p>
        {checked && <p className="text-xs text-muted">{checked}</p>}
      </div>
    );
  }
  return (
    <div className="max-w-xs space-y-1 lg:text-right">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-primary lg:justify-end">
        <Loader2 className="size-4 animate-spin" />
        Đang chờ TikTok xác nhận
      </p>
      {checked && <p className="text-xs text-muted">{checked}</p>}
      <p className="text-xs text-muted">Trạng thái sẽ cập nhật sớm, bạn không cần làm gì thêm</p>
    </div>
  );
}
