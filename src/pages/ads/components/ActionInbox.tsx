import { AlertTriangle, ArrowRight, Bot, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import Card from '../../../components/ui/Card';
import { formatDateTime, formatNumber, shortVnd } from '../../../lib/format';
import { signedVnd } from '../agent/components/VerdictBadge';
import { MODE_LABEL } from '../agent/meta';
import type { AgentRule } from '../agent/types';
import { groupDescription, groupMeta } from '../groups';
import { useAdsSettings } from '../settings';
import type { VideoAction } from '../types';

export interface ActionSummary {
  count: number;
  cost: number;
  revenue: number;
}

interface ActionInboxProps {
  /** Số video / chi phí / doanh thu theo ID nhóm */
  summary: Record<string, ActionSummary>;
  /** Số sản phẩm chưa nhập ROI hoà vốn */
  missingBreakEven: number;
  onOpenAction: (action: VideoAction) => void;
  onOpenSettings: () => void;
  agent: {
    paused: boolean;
    lastRunAt: string | null;
    pendingCount: number;
    /** Lợi nhuận tác động 30 ngày (ước tính); null nếu chưa có */
    impact30: number | null;
    /** Quy tắc đang xử lý từng nhóm */
    ruleFor: (action: VideoAction) => AgentRule | null;
  };
}

const EMPTY: ActionSummary = { count: 0, cost: 0, revenue: 0 };

/** "Agent đang theo dõi": mỗi nhóm video (Sếp tự định nghĩa) là một ô + quy tắc Agent xử lý nhóm đó */
export default function ActionInbox({ summary, missingBreakEven, onOpenAction, onOpenSettings, agent }: ActionInboxProps) {
  const { settings } = useAdsSettings();
  const tiles = settings.groups.filter((g) => g.showInInbox);
  const fallback = settings.groups.find((g) => g.kind === 'fallback');
  const quietCount = settings.groups
    .filter((g) => !g.showInInbox)
    .reduce((acc, g) => acc + (summary[g.id]?.count ?? 0), 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Agent đang theo dõi</h2>
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            <Bot className="size-4" />
            {agent.paused ? 'Agent tạm dừng' : 'Agent'} · Lần chạy gần nhất:{' '}
            {agent.lastRunAt ? formatDateTime(agent.lastRunAt) : 'chưa chạy'}
            {agent.impact30 != null && (
              <span className={agent.impact30 >= 0 ? 'text-accent-green' : 'text-danger'}>
                {' '}
                · 30 ngày: {signedVnd(agent.impact30)} (ước tính)
              </span>
            )}
            {quietCount > 0 && (
              <>
                {' '}
                · {formatNumber(quietCount)} video {fallback && !fallback.showInInbox ? fallback.name.toLowerCase() : 'ở nhóm ẩn'}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/ads/agent?view=groups"
            className="flex w-fit items-center gap-2 rounded-xl border border-line px-3.5 py-2 text-sm font-medium transition-colors hover:bg-canvas"
          >
            <SlidersHorizontal className="size-4 text-muted" />
            Sửa định nghĩa nhóm
          </Link>
          <Link
            to="/ads/agent"
            className="flex w-fit items-center gap-2 rounded-xl bg-primary-soft px-3.5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            Mở AI Agent
            {agent.pendingCount > 0 && (
              <span className="rounded-full bg-danger px-1.5 py-0.5 text-xs leading-none text-white">
                {agent.pendingCount} chờ duyệt
              </span>
            )}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

      {missingBreakEven > 0 && (
        <div className="flex flex-col gap-2 border-b border-line bg-amber-50/60 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="size-4 shrink-0" />
            {missingBreakEven} sản phẩm chưa có ROI hoà vốn — điều kiện so với hoà vốn sẽ không khớp.
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-fit rounded-lg bg-white px-3 py-1.5 font-medium text-amber-700 shadow-sm transition hover:shadow-md"
          >
            Nhập ROI hoà vốn
          </button>
        </div>
      )}

      {/* gap-px + nền line = đường kẻ giữa các ô, đúng với mọi số lượng nhóm */}
      <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((group) => {
          const meta = groupMeta(group);
          const s = summary[group.id] ?? EMPTY;
          const rule = agent.ruleFor(group.id);
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onOpenAction(group.id)}
              className="group flex items-start gap-3 bg-white p-5 text-left transition-colors hover:bg-canvas"
            >
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${meta.tone}`}>
                <meta.icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-muted group-hover:text-ink">{meta.label}</span>
                <span className="mt-0.5 block text-2xl font-bold tabular-nums">
                  {formatNumber(s.count)} <span className="text-sm font-medium text-muted">video</span>
                </span>
                <span className="block text-sm font-medium tabular-nums">
                  Chi {shortVnd(s.cost)} · DT {shortVnd(s.revenue)}
                </span>
                <span className="mt-1 line-clamp-2 text-xs text-muted" title={groupDescription(group)}>
                  {groupDescription(group)}
                </span>
                <span
                  className={`mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${
                    rule && rule.mode !== 'off' ? 'bg-violet-50 text-accent-violet' : 'bg-canvas text-muted'
                  }`}
                >
                  <Bot className="size-3" />
                  {rule ? `${rule.name} · ${MODE_LABEL[rule.mode]}` : 'Chưa có quy tắc'}
                </span>
              </span>
            </button>
          );
        })}
        {/* Lấp ô trống cuối hàng cho nền trắng */}
        {tiles.length % 4 !== 0 && <div className="hidden bg-white xl:block" style={{ gridColumn: `span ${4 - (tiles.length % 4)}` }} />}
      </div>
    </Card>
  );
}
