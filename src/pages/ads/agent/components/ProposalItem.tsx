import { useState } from 'react';
import { Check, CheckCircle2, Clock, X } from 'lucide-react';
import { formatDateTime } from '../../../../lib/format';
import type { AgentProposal, ProposalStatus } from '../types';
import { ActionCell, ITEM_GRID, TargetCell } from './AgentBits';
import MetricWindowBox from './MetricWindowBox';

interface ProposalItemProps {
  item: AgentProposal;
  ruleName: string | null;
  selected: boolean;
  onToggle: () => void;
  onDecide: (decision: 'approve' | 'reject') => Promise<void>;
}

/** Nhãn trạng thái cho đề xuất đã xử lý */
const STATUS_META: Record<Exclude<ProposalStatus, 'pending'>, { label: string; cls: string; icon: typeof Check }> = {
  approved: { label: 'Đã duyệt', cls: 'bg-primary-soft text-primary', icon: CheckCircle2 },
  rejected: { label: 'Đã bỏ qua', cls: 'bg-canvas text-muted', icon: X },
  expired: { label: 'Hết hạn', cls: 'bg-canvas text-muted', icon: Clock },
};

/** Một đề xuất: hành động · đối tượng · số liệu + lý do · Duyệt / Bỏ qua (hoặc trạng thái nếu đã xử lý) */
export default function ProposalItem({ item, ruleName, selected, onToggle, onDecide }: ProposalItemProps) {
  const [busy, setBusy] = useState(false);
  const pending = item.status === 'pending';
  const decide = async (d: 'approve' | 'reject') => {
    setBusy(true);
    await onDecide(d);
    setBusy(false);
  };

  return (
    <li className={`${ITEM_GRID} transition-colors hover:bg-canvas/50`}>
      <div className="flex items-start gap-3">
        {pending && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label="Chọn đề xuất"
            className="mt-0.5 size-4 accent-primary"
          />
        )}
        <div>
          <p className="text-sm font-semibold tabular-nums">{formatDateTime(item.createdAt)}</p>
          {pending && <p className="mt-1 text-xs text-muted">Hết hạn {formatDateTime(item.expiresAt)}</p>}
        </div>
      </div>

      <ActionCell actionType={item.actionType} ruleName={ruleName} params={item.params} />
      <TargetCell target={item.target} />

      <div className="space-y-2">
        <MetricWindowBox title="Lúc đề xuất" window={item.before} />
        <p className="text-sm">
          <span className="font-semibold">Vì sao: </span>
          <span className="text-muted">{item.reason}</span>
        </p>
        {pending && item.note && <p className="text-xs text-accent-violet">{item.note}</p>}
      </div>

      {pending ? (
        <div className="flex gap-2 lg:flex-col lg:items-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide('approve')}
            title="Duyệt (giai đoạn thử: chỉ ghi nhận, chưa thao tác trên TikTok)"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="size-3.5" />
            Duyệt
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide('reject')}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="size-3.5" />
            Bỏ qua
          </button>
        </div>
      ) : (
        <StatusCell item={item} />
      )}
    </li>
  );
}

function StatusCell({ item }: { item: AgentProposal }) {
  const meta = STATUS_META[item.status as Exclude<ProposalStatus, 'pending'>];
  const when = item.status === 'expired' ? item.expiresAt : item.decidedAt;
  return (
    <div className="flex flex-col gap-1 lg:items-end lg:text-right">
      <span
        className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${meta.cls}`}
      >
        <meta.icon className="size-3.5" />
        {meta.label}
      </span>
      {when && <span className="text-xs tabular-nums text-muted">{formatDateTime(when)}</span>}
      {item.status === 'approved' && (
        <span className="max-w-[180px] text-xs text-muted">Chờ thực thi — chưa thao tác trên TikTok</span>
      )}
    </div>
  );
}
