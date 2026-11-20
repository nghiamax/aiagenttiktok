import { Ban, Clock, X } from 'lucide-react';
import { formatDateTime } from '../../../../lib/format';
import { useAdsData } from '../../data';
import { describeTarget } from '../lookup';
import { actionTypeMeta } from '../meta';
import type { AgentProposal } from '../types';

/** Trạng thái của đề xuất đã đóng (không chạy trên TikTok) */
export const CLOSED_META = {
  rejected: { label: 'Đã bỏ qua', icon: X },
  expired: { label: 'Hết hạn', icon: Clock },
  outdated: { label: 'Không còn khớp', icon: Ban },
} as const;

export type ClosedStatus = keyof typeof CLOSED_META;

export const isClosed = (p: AgentProposal): p is AgentProposal & { status: ClosedStatus } => p.status in CLOSED_META;

/** Dòng gọn cho đề xuất đã đóng: thời gian · hành động · đối tượng · trạng thái · lý do */
export default function ClosedProposalRow({ item }: { item: AgentProposal & { status: ClosedStatus } }) {
  const { snapshot } = useAdsData();
  const info = describeTarget(snapshot, item.target);
  const action = actionTypeMeta(item.actionType, item.params);
  const meta = CLOSED_META[item.status];
  const when = item.status === 'expired' ? item.expiresAt : item.decidedAt;

  return (
    <li className="grid gap-x-4 gap-y-1 px-5 py-3 text-sm transition-colors hover:bg-canvas/50 lg:grid-cols-[150px_150px_minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center">
      <span className="tabular-nums text-muted">{formatDateTime(item.createdAt)}</span>
      <span className={`inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${action.className}`}>
        <action.icon className="size-3.5" />
        {action.label}
      </span>
      <span className="truncate font-medium" title={`${info.title}\n${info.productName}`}>
        {info.title}
      </span>
      <span className="min-w-0 text-xs text-muted">
        <span className="mr-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-canvas px-2 py-0.5 font-semibold">
          <meta.icon className="size-3.5" />
          {meta.label}
          {when && ` · ${formatDateTime(when)}`}
        </span>
        {item.status === 'outdated' && item.note}
      </span>
    </li>
  );
}
