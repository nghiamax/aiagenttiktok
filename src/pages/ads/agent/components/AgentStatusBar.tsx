import { Bot, Pause } from 'lucide-react';
import Card from '../../../../components/ui/Card';
import { formatDateTime, formatNumber } from '../../../../lib/format';
import { shortVnd } from '../../classify';
import { impactTotal } from '../evaluate';
import type { AgentActionLog, AgentGuardrails } from '../types';
import { signedVnd } from './VerdictBadge';

interface AgentStatusBarProps {
  paused: boolean;
  lastRunAt: string | null;
  actions: AgentActionLog[];
  guardrails: AgentGuardrails;
  activeRules: number;
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

/** Dải trạng thái Agent: đang bật/tạm dừng, lần chạy gần nhất, mức dùng giới hạn hôm nay */
export default function AgentStatusBar({ paused, lastRunAt, actions, guardrails, activeRules }: AgentStatusBarProps) {
  const today = actions.filter((a) => isToday(a.executedAt) && a.status !== 'failed');
  const boostToday = today
    .filter((a) => a.actionType === 'boost_creative')
    .reduce((acc, a) => acc + (a.params.boostBudget ?? 0) * (a.params.boostDays ?? 1), 0);
  const running = !paused && activeRules > 0;
  const impact30 = impactTotal(actions, guardrails.evaluateAfterHours, '30d');

  const stats = [
    { label: 'Lần chạy gần nhất', value: lastRunAt ? formatDateTime(lastRunAt) : 'Chưa chạy lần nào' },
    { label: 'Tăng cường hôm nay', value: `${shortVnd(boostToday)} / ${shortVnd(guardrails.dailyBoostCap)}` },
    { label: 'Thao tác hôm nay', value: `${formatNumber(today.length)} / ${formatNumber(guardrails.maxActionsPerDay)}` },
    { label: 'Hiệu quả 30 ngày', value: impact30 == null ? '--' : `${signedVnd(impact30)} (ước tính)` },
  ];

  return (
    <Card className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <span
          className={`flex size-11 items-center justify-center rounded-xl ${
            running ? 'bg-violet-50 text-accent-violet' : 'bg-canvas text-muted'
          }`}
        >
          <Bot className="size-6" />
        </span>
        <div>
          <p className="flex items-center gap-2 font-semibold">
            AI Agent
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                paused ? 'bg-amber-50 text-amber-600' : running ? 'bg-green-50 text-accent-green' : 'bg-canvas text-muted'
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${paused ? 'bg-amber-500' : running ? 'bg-accent-green' : 'bg-muted'}`}
              />
              {paused ? 'Tạm dừng' : running ? 'Đang bật' : 'Chưa bật quy tắc nào'}
            </span>
          </p>
          <p className="text-sm text-muted">
            {activeRules} quy tắc đang bật · Chạy tự động cần backend (giai đoạn sau)
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-xs text-muted">{s.label}</dt>
              <dd className="text-sm font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          disabled
          title="Tạm dừng toàn bộ Agent · Cần backend"
          className="flex w-fit cursor-not-allowed items-center gap-2 rounded-xl border border-line px-3.5 py-2 text-sm font-medium text-muted opacity-60"
        >
          <Pause className="size-4" />
          Tạm dừng Agent
        </button>
      </div>
    </Card>
  );
}
