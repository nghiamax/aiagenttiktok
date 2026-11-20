import { Check, X } from 'lucide-react';
import { formatDateTime } from '../../../../lib/format';
import type { AgentProposal } from '../types';
import { ActionCell, ITEM_GRID, TargetCell } from './AgentBits';
import MetricWindowBox from './MetricWindowBox';

interface ProposalItemProps {
  item: AgentProposal;
  ruleName: string | null;
  selected: boolean;
  /** Đang gửi lệnh (khoá nút) */
  busy: boolean;
  onToggle: () => void;
  /** Mở hộp xác nhận chạy thật */
  onApprove: () => void;
  onReject: () => void;
}

/**
 * Một đề xuất đang chờ: hành động · đối tượng · số liệu + lý do · Duyệt / Bỏ qua.
 * Đề xuất đã chạy xem ở Nhật ký; đề xuất đã đóng xem ở khối "Đề xuất đã đóng".
 */
export default function ProposalItem({ item, ruleName, selected, busy, onToggle, onApprove, onReject }: ProposalItemProps) {
  // Duyệt từ trước khi bật chạy thật (chưa có thao tác) → chỉ còn nút Duyệt để chạy
  const legacyApproved = item.status === 'approved' && !item.actionId;

  return (
    <li className={`${ITEM_GRID} transition-colors hover:bg-canvas/50`}>
      <div className="flex items-start gap-3">
        {!legacyApproved && (
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
          <p className="mt-1 text-xs text-muted">
            {legacyApproved ? 'Đã duyệt trước đó — bấm Duyệt để chạy' : `Hết hạn ${formatDateTime(item.expiresAt)}`}
          </p>
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
        {item.note && <p className="text-xs text-danger">{item.note}</p>}
      </div>

      <div className="flex gap-2 lg:flex-col lg:items-end">
        <button
          type="button"
          disabled={busy}
          onClick={onApprove}
          title="Duyệt → xác nhận → chạy thật trên TikTok"
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="size-3.5" />
          Duyệt
        </button>
        {!legacyApproved && (
          <button
            type="button"
            disabled={busy}
            onClick={onReject}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="size-3.5" />
            Bỏ qua
          </button>
        )}
      </div>
    </li>
  );
}
