import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, ListFilter, Tag, Trash2 } from 'lucide-react';
import { useAuth } from '../../../../auth/AuthProvider';
import FilterSelect from '../../../../components/ui/FilterSelect';
import SegmentedControl from '../../../../components/ui/SegmentedControl';
import EmptyTableState from '../../components/EmptyTableState';
import { ACTION_TYPE_META, ACTOR_META } from '../meta';
import type { ExecOutcome } from '../agentStore';
import type { ActionActor, AgentActionLog, AgentActionType, AgentProposal, AgentRule } from '../types';
import ActionLogItem from './ActionLogItem';

interface ActionLogListProps {
  actions: AgentActionLog[];
  /** Để hiện "Đề xuất lúc …" cho dòng Sếp duyệt */
  proposals: AgentProposal[];
  rules: AgentRule[];
  evaluateAfterHours: number;
  /** Hoàn tác (chạy thật trên TikTok, đã qua hộp xác nhận) */
  onUndo: (actionId: string) => Promise<ExecOutcome>;
  onRetry: (actionId: string) => Promise<ExecOutcome>;
  onVerify: (actionId: string) => Promise<ExecOutcome>;
  /** Xoá dòng nhật ký (chỉ ẩn) */
  onHide: (ids: string[]) => Promise<ExecOutcome>;
}

type Period = 'today' | '7d' | 'all';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Hôm nay' },
  { value: '7d', label: '7 ngày' },
  { value: 'all', label: 'Tất cả' },
];

function inPeriod(iso: string, period: Period): boolean {
  if (period === 'all') return true;
  const t = new Date(iso).getTime();
  if (period === '7d') return Date.now() - t <= 7 * 86_400_000;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return t >= start.getTime();
}

/** Tab Nhật ký: mọi hành động đã thực hiện, mới nhất trên cùng */
export default function ActionLogList({ actions, proposals, rules, evaluateAfterHours, onUndo, onRetry, onVerify, onHide }: ActionLogListProps) {
  const proposedAt = new Map(proposals.map((p) => [p.id, p.createdAt]));
  const [period, setPeriod] = useState<Period>('7d');
  const [type, setType] = useState<string | null>(null);
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [actor, setActor] = useState<string | null>(null);
  // Link "Xem ở Nhật ký" (Theo dõi video): ?log=<id> → bỏ lọc nếu đang giấu dòng đó, cuộn tới và làm nổi vài giây
  const [params, setParams] = useSearchParams();
  const focusId = params.get('log');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const focusItem = focusId ? actions.find((a) => a.id === focusId) : undefined;
  useEffect(() => {
    if (!focusId) return;
    if (!focusItem) {
      // Nhật ký chưa tải xong → chờ; đã có dữ liệu mà không có dòng đó → bỏ tham số
      if (actions.length > 0) {
        setParams((p) => {
          p.delete('log');
          return p;
        }, { replace: true });
      }
      return;
    }
    setPeriod('all');
    setType(null);
    setRuleId(null);
    setActor(null);
    setHighlightId(focusId);
    setParams((p) => {
      p.delete('log');
      return p;
    }, { replace: true });
  }, [focusId, focusItem, actions.length, setParams]);
  useEffect(() => {
    if (!highlightId) return;
    const t1 = window.setTimeout(() => {
      document.getElementById(`log-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    const t2 = window.setTimeout(() => setHighlightId(null), 3500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [highlightId]);

  const canDelete = useAuth().can('configure');
  const [hideMsg, setHideMsg] = useState<ExecOutcome | null>(null);
  const hide = async (ids: string[], question: string) => {
    if (ids.length === 0 || !window.confirm(question)) return;
    setHideMsg(await onHide(ids));
  };
  const ruleName = (id: string | null) => (id ? (rules.find((r) => r.id === id)?.name ?? id) : null);
  const list = actions
    .filter(
      (a) =>
        !a.hidden &&
        inPeriod(a.executedAt, period) &&
        (!type || a.actionType === type) &&
        (!ruleId || a.ruleId === ruleId) &&
        (!actor || a.actor === actor),
    )
    .sort((a, b) => b.executedAt.localeCompare(a.executedAt));

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4">
        <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} ariaLabel="Khoảng thời gian" />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <FilterSelect
            label="Hành động"
            icon={Tag}
            allLabel="Tất cả hành động"
            options={(Object.keys(ACTION_TYPE_META) as AgentActionType[]).map((k) => ({
              value: k,
              label: ACTION_TYPE_META[k].label,
            }))}
            value={type}
            onChange={setType}
            searchPlaceholder="Gõ tên hành động…"
          />
          <FilterSelect
            label="Quy tắc"
            icon={ListFilter}
            allLabel="Tất cả quy tắc"
            options={rules.map((r) => ({ value: r.id, label: r.name }))}
            value={ruleId}
            onChange={setRuleId}
            searchPlaceholder="Gõ tên quy tắc…"
          />
          <FilterSelect
            label="Người làm"
            icon={Bot}
            allLabel="Tất cả"
            options={(Object.keys(ACTOR_META) as ActionActor[]).map((k) => ({ value: k, label: ACTOR_META[k].label }))}
            value={actor}
            onChange={setActor}
            searchPlaceholder="Gõ để lọc…"
          />
          {canDelete && list.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const ids = list.filter((a) => a.status !== 'running').map((a) => a.id);
                void hide(ids, `Xoá ${ids.length} dòng nhật ký đang hiện (theo bộ lọc)?\n\nChỉ ẩn khỏi Nhật ký / Hiệu quả / Theo dõi video — BOT vẫn dùng để tính giới hạn an toàn và thời gian chờ. Dòng đang chờ TikTok xác nhận không bị xoá.`);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-medium text-muted transition hover:border-danger hover:bg-rose-50 hover:text-danger sm:ml-auto"
            >
              <Trash2 className="size-4" />
              Xoá {list.length} dòng đang hiện
            </button>
          )}
        </div>
        {hideMsg && <p className={`text-sm ${hideMsg.ok ? 'text-accent-green' : 'text-danger'}`}>{hideMsg.message}</p>}
      </div>

      {list.length > 0 ? (
        <ul className="divide-y divide-line">
          {list.map((a) => (
            <ActionLogItem
              key={a.id}
              item={a}
              all={actions}
              ruleName={ruleName(a.ruleId)}
              evaluateAfterHours={evaluateAfterHours}
              proposedAt={a.proposalId ? proposedAt.get(a.proposalId) : undefined}
              onUndo={onUndo}
              onRetry={onRetry}
              onVerify={onVerify}
              highlight={a.id === highlightId}
              onDelete={
                canDelete && a.status !== 'running'
                  ? () => void hide([a.id], 'Xoá dòng nhật ký này?\n\nChỉ ẩn khỏi Nhật ký / Hiệu quả / Theo dõi video — BOT vẫn dùng để tính giới hạn an toàn và thời gian chờ.')
                  : undefined
              }
            />
          ))}
        </ul>
      ) : (
        <EmptyTableState
          title="Agent chưa thực hiện thao tác nào"
          description="Mỗi lần Agent gỡ video, tăng cường hay đổi ngân sách sẽ được ghi tại đây kèm số liệu lúc quyết định và sau thao tác."
        />
      )}
    </>
  );
}
