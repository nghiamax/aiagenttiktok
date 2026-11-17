import { Check, X } from 'lucide-react';
import { formatDateTime } from '../../../../lib/format';
import type { AgentProposal } from '../types';
import { ActionCell, ITEM_GRID, TargetCell } from './AgentBits';
import MetricWindowBox from './MetricWindowBox';

interface ProposalItemProps {
  item: AgentProposal;
  ruleName: string | null;
  selected: boolean;
  onToggle: () => void;
}

const LOCKED = 'Chưa kết nối backend';

/** Một đề xuất chờ duyệt: hành động · đối tượng · số liệu + lý do · Duyệt / Bỏ qua */
export default function ProposalItem({ item, ruleName, selected, onToggle }: ProposalItemProps) {
  return (
    <li className={`${ITEM_GRID} transition-colors hover:bg-canvas/50`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label="Chọn đề xuất"
          className="mt-0.5 size-4 accent-primary"
        />
        <div>
          <p className="text-sm font-semibold tabular-nums">{formatDateTime(item.createdAt)}</p>
          <p className="mt-1 text-xs text-muted">Hết hạn {formatDateTime(item.expiresAt)}</p>
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
      </div>

      <div className="flex gap-2 lg:flex-col lg:items-end">
        <button
          type="button"
          disabled
          title={`Duyệt · ${LOCKED}`}
          className="flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white opacity-50"
        >
          <Check className="size-3.5" />
          Duyệt
        </button>
        <button
          type="button"
          disabled
          title={`Bỏ qua · ${LOCKED}`}
          className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted opacity-60"
        >
          <X className="size-3.5" />
          Bỏ qua
        </button>
      </div>
    </li>
  );
}
