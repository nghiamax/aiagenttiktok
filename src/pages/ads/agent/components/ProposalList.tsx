import { useEffect, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, ChevronRight, X } from 'lucide-react';
import EmptyTableState from '../../components/EmptyTableState';
import { useAdsData } from '../../data';
import { useNoPermission } from '../../../../auth/AuthProvider';
import type { ExecOutcome } from '../agentStore';
import { describeExec } from '../execText';
import { bulkSelectable, offsetWarning, profitWarning, removeKeepsProfit } from '../../../../../shared/offsetText';
import type { AgentProposal, AgentRule } from '../types';
import ClosedProposalRow, { CLOSED_META, isClosed, type ClosedStatus } from './ClosedProposalRow';
import ConfirmExecuteModal from './ConfirmExecuteModal';
import ProposalItem from './ProposalItem';
import SignalList from './SignalList';
import type { SignalItem } from '../useSignals';

interface ProposalListProps {
  /** Toàn bộ đề xuất (mọi trạng thái) */
  proposals: AgentProposal[];
  rules: AgentRule[];
  /** approve = chạy thật trên TikTok */
  onDecide: (id: string, decision: 'approve' | 'reject') => Promise<ExecOutcome>;
  /** Mở tab Nhật ký (xem kết quả đã chạy) */
  onOpenLog: () => void;
  /** Dấu hiệu (7 ngày thuộc nhóm, 14 ngày chưa) — chỉ báo, không duyệt */
  signals: SignalItem[];
}

/** Kết quả sau khi duyệt / bỏ qua */
interface Notice {
  decision: 'approve' | 'reject';
  ok: number;
  /** Đã gửi, chờ TikTok xác nhận (gỡ / thêm video) */
  verifying: number;
  failed: { name: string; message: string }[];
}

const NOTICE_MS = 8000;
const MAX_CLOSED = 50;

/** Đang chờ Sếp quyết: chờ duyệt + đã duyệt từ trước khi bật chạy thật (chưa có thao tác) */
const isOpen = (p: AgentProposal) => p.status === 'pending' || (p.status === 'approved' && !p.actionId);

/**
 * Tab Chờ duyệt: chỉ việc cần Sếp quyết. Duyệt → hộp xác nhận → chạy thật trên TikTok → kết quả ở Nhật ký.
 * Đề xuất bỏ qua / hết hạn / không còn khớp gộp trong khối "Đề xuất đã đóng".
 */
export default function ProposalList({ proposals, rules, signals, onDecide, onOpenLog }: ProposalListProps) {
  const { snapshot } = useAdsData();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  /** Đề xuất đang chờ Sếp xác nhận chạy thật */
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  // Tài khoản không có quyền chạy thao tác → chỉ xem
  const noExec = useNoPermission('execute');

  const ruleName = (id: string) => rules.find((r) => r.id === id)?.name ?? null;
  const byId = new Map(proposals.map((p) => [p.id, p]));
  // Gỡ video có đơn bù ở sản phẩm khác → nhắc lại ngay trong hộp xác nhận
  const lineOf = (p: AgentProposal) =>
    describeExec(snapshot, p.actionType, p.params, p.target) +
    (p.actionType === 'remove_creative' && p.offset ? `\n${offsetWarning(p.offset)}` : '');
  const open = proposals.filter(isOpen);
  const selectable = open.filter((p) => p.status === 'pending');
  // "Chọn tất cả" bỏ qua gỡ video tổng vẫn có lời — muốn gỡ thì tích từng cái
  const bulk = bulkSelectable(selectable);
  const bulkSkipped = selectable.length - bulk.length;
  const closed = proposals.filter(isClosed).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const closedCount = (s: ClosedStatus) => closed.filter((p) => p.status === s).length;
  const allSelected = bulk.length > 0 && bulk.every((p) => selected.has(p.id));
  const confirming = (confirmIds ?? []).map((id) => byId.get(id)).filter((p): p is AgentProposal => !!p);
  const keepsProfit = confirming.filter(removeKeepsProfit).length;

  // Tự ẩn dòng kết quả (giữ lại nếu có việc không chạy được)
  useEffect(() => {
    if (!notice || notice.failed.length > 0) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  /** Chạy lần lượt từng đề xuất (server cũng xếp hàng, mỗi lần 1 lệnh) */
  async function decide(ids: string[], decision: 'approve' | 'reject') {
    setBusy(true);
    const next: Notice = { decision, ok: 0, verifying: 0, failed: [] };
    for (const id of ids) {
      const r = await onDecide(id, decision);
      const p = byId.get(id);
      if (!r.ok) next.failed.push({ name: p ? lineOf(p) : id, message: r.message });
      else if (r.status === 'running') next.verifying++;
      else next.ok++;
    }
    setSelected(new Set());
    setBusy(false);
    setNotice(next);
  }

  return (
    <>
      {noExec && open.length > 0 && (
        <p className="border-b border-line bg-canvas px-5 py-3 text-sm text-muted">
          Tài khoản của bạn chỉ được xem — không duyệt / bỏ qua đề xuất được.
        </p>
      )}
      {selectable.length > 0 && !noExec && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={bulk.length === 0}
              onChange={() => setSelected(allSelected ? new Set() : new Set(bulk.map((p) => p.id)))}
              className="size-4 accent-primary"
            />
            Chọn tất cả {selected.size > 0 && <span className="text-muted">({selected.size})</span>}
          </label>
          {bulkSkipped > 0 && (
            <span className="text-xs text-amber-700" title="Muốn gỡ thì tích từng đề xuất">
              (bỏ qua {bulkSkipped} video tổng vẫn có lời)
            </span>
          )}
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => setConfirmIds([...selected])}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="size-4" />
            Duyệt đã chọn
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => decide([...selected], 'reject')}
            className="flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="size-4" />
            Bỏ qua
          </button>
        </div>
      )}

      {notice && (
        <NoticeBar
          notice={notice}
          onClose={() => setNotice(null)}
          onOpenLog={onOpenLog}
          onOpenClosed={() => setShowClosed(true)}
        />
      )}

      {open.length > 0 ? (
        <ul className="divide-y divide-line">
          {open.map((p) => (
            <ProposalItem
              key={p.id}
              item={p}
              ruleName={ruleName(p.ruleId)}
              selected={selected.has(p.id)}
              busy={busy || !!noExec}
              onToggle={() => toggle(p.id)}
              onApprove={() => setConfirmIds([p.id])}
              onReject={() => decide([p.id], 'reject')}
            />
          ))}
        </ul>
      ) : (
        <EmptyTableState
          title="Không có đề xuất nào đang chờ"
          description={
            signals.length > 0
              ? 'Chưa có việc nào đủ chắc chắn để duyệt. Các dấu hiệu bên dưới Agent đang theo dõi — đủ 14 ngày cùng nhóm sẽ đưa lên đây.'
              : 'Khi quy tắc ở chế độ Cần duyệt, các việc BOT muốn làm sẽ hiện ở đây. Sếp duyệt + xác nhận thì BOT chạy thật trên TikTok, kết quả xem ở Nhật ký.'
          }
        />
      )}

      <SignalList items={signals} />

      {closed.length > 0 && (
        <div className="border-t border-line">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            aria-expanded={showClosed}
            className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-5 py-3 text-left text-sm transition-colors hover:bg-canvas/60"
          >
            <ChevronRight className={`size-4 text-muted transition-transform ${showClosed ? 'rotate-90' : ''}`} />
            <span className="font-semibold">Đề xuất đã đóng ({closed.length})</span>
            <span className="text-xs text-muted">
              {(Object.keys(CLOSED_META) as ClosedStatus[])
                .filter((s) => closedCount(s) > 0)
                .map((s) => `${CLOSED_META[s].label.toLowerCase()} ${closedCount(s)}`)
                .join(' · ')}
            </span>
          </button>
          {showClosed && (
            <ul className="divide-y divide-line border-t border-line bg-canvas/30">
              {closed.slice(0, MAX_CLOSED).map((p) => (
                <ClosedProposalRow key={p.id} item={p} />
              ))}
            </ul>
          )}
        </div>
      )}

      {confirming.length > 0 && (
        <ConfirmExecuteModal
          title={confirming.length > 1 ? `Chạy thật ${confirming.length} việc trên TikTok?` : 'Chạy thật trên TikTok?'}
          lines={confirming.map(lineOf)}
          topWarning={keepsProfit > 0 ? profitWarning(keepsProfit) : undefined}
          boostTotal={confirming
            .filter((p) => p.actionType === 'boost_creative')
            .reduce((s, p) => s + (p.params.boostBudget ?? 0) * (p.params.boostDays ?? 1), 0)}
          confirmLabel="Xác nhận"
          onConfirm={() => decide(confirming.map((p) => p.id), 'approve')}
          onClose={() => setConfirmIds(null)}
        />
      )}
    </>
  );
}

interface NoticeBarProps {
  notice: Notice;
  onClose: () => void;
  onOpenLog: () => void;
  onOpenClosed: () => void;
}

function NoticeBar({ notice, onClose, onOpenLog, onOpenClosed }: NoticeBarProps) {
  const done = notice.ok + notice.verifying;
  const failedOnly = done === 0 && notice.failed.length > 0;
  const approve = notice.decision === 'approve';
  return (
    <div
      className={`space-y-1.5 border-b border-line px-5 py-3 text-sm ${failedOnly ? 'bg-rose-50' : 'bg-green-50'}`}
      aria-live="polite"
    >
      {done > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-accent-green">
          <CheckCircle2 className="size-4 shrink-0" />
          <span className="font-semibold">
            {approve ? `Đã chạy trên TikTok ${done} việc` : `Đã bỏ qua ${done} đề xuất`}
            {approve && notice.verifying > 0 && ` · ${notice.verifying} việc gỡ / thêm video đang chờ TikTok cập nhật`}
          </span>
          <button
            type="button"
            onClick={approve ? onOpenLog : onOpenClosed}
            className="font-semibold underline underline-offset-2 hover:text-ink"
          >
            {approve ? 'Xem ở Nhật ký' : 'Xem ở Đề xuất đã đóng'}
          </button>
        </p>
      )}
      {notice.failed.map((f, i) => (
        <p key={i} className="flex items-start gap-2 text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold">Không chạy được:</span> {f.name} — {f.message}
          </span>
        </p>
      ))}
      {notice.failed.length > 0 && (
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-semibold text-muted underline underline-offset-2 hover:text-ink"
        >
          Đóng
        </button>
      )}
    </div>
  );
}
