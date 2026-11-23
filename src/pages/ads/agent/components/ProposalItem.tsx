import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, X } from 'lucide-react';
import { formatDateTime, formatNumber } from '../../../../lib/format';
import { offsetBadge, offsetTotal } from '../../../../../shared/offsetText';
import type { AgentProposal } from '../types';
import { ActionCell, ITEM_GRID, TargetCell } from './AgentBits';
import MetricWindowBox from './MetricWindowBox';
import WindowsTable from './WindowsTable';
import OffsetNotice from './OffsetNotice';

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
  // Gỡ video có đơn bù ở sản phẩm khác → nhãn cạnh hành động, bấm để xem chi tiết
  const offset = item.actionType === 'remove_creative' ? item.offset : undefined;
  const [showOffset, setShowOffset] = useState(false);

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

      <div className="min-w-0">
        <ActionCell actionType={item.actionType} ruleName={ruleName} params={item.params} />
        {offset && (
          <button
            type="button"
            onClick={() => setShowOffset((s) => !s)}
            aria-expanded={showOffset}
            title="Video có đơn bù ở sản phẩm khác trong chiến dịch — bấm để xem số tổng"
            className={`mt-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold transition ${
              offset.profitable === false ? 'bg-canvas text-muted hover:text-ink' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
            }`}
          >
            {offset.profitable !== false && <AlertTriangle className="size-3.5" />}
            {offsetBadge(offset)}
            <ChevronDown className={`size-3.5 transition-transform ${showOffset ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      <TargetCell target={item.target} />

      <div className="space-y-2">
        {item.windows ? (
          // Đề xuất có số 14 / 30 ngày (sau khi bật xác nhận 22/11) → bảng 3 khung
          <>
            <WindowsTable before={item.before} windows={item.windows} long={item.long} slowLoss={item.slowLoss} />
            {offset && (
              <p className="text-xs tabular-nums text-muted">
                Tổng video (gồm đơn bù, 7 ngày): {offsetTotal(offset)} · {formatNumber(offset.total.orders)} đơn
              </p>
            )}
          </>
        ) : (
          <MetricWindowBox
            title="Lúc đề xuất"
            window={item.before}
            extra={offset ? `Tổng video (gồm đơn bù): ${offsetTotal(offset)} · ${formatNumber(offset.total.orders)} đơn` : undefined}
          />
        )}
        <p className="text-sm">
          <span className="font-semibold">Vì sao: </span>
          <span className="text-muted">{item.reason}</span>
        </p>
        {offset && showOffset && <OffsetNotice offset={offset} />}
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
