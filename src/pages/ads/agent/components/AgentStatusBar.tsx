import { useState } from 'react';
import { AlertTriangle, Bot, Loader2, RefreshCw } from 'lucide-react';
import Card from '../../../../components/ui/Card';
import { useAuth } from '../../../../auth/AuthProvider';
import { formatDateTime, formatNumber } from '../../../../lib/format';
import { shortVnd } from '../../classify';
import type { AgentSchedule, RunSummary } from '../agentStore';
import { impactTotal } from '../evaluate';
import type { AgentActionLog, AgentGuardrails, AgentProposal } from '../types';
import { signedVnd } from './VerdictBadge';

interface AgentStatusBarProps {
  paused: boolean;
  lastRunAt: string | null;
  lastRunError: string | null;
  /** Server đang chạy một lượt */
  running: boolean;
  /** Đã kết nối server */
  connected: boolean;
  /** Lỗi gọi server */
  error: string | null;
  schedule: AgentSchedule;
  onRunNow: () => Promise<RunSummary | null>;
  onTogglePause: () => void;
  actions: AgentActionLog[];
  proposals: AgentProposal[];
  guardrails: AgentGuardrails;
  activeRules: number;
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

function summaryText(s: RunSummary): string {
  if (s.skipped === 'paused') return 'Agent đang tạm dừng nên không chạy.';
  const skipped = Object.entries(s.skippedTargets)
    .map(([reason, n]) => `${reason.toLowerCase()}: ${n}`)
    .join(', ');
  const outdated = s.outdated ? `, ${s.outdated} đề xuất cũ tự huỷ (không còn khớp số liệu mới)` : '';
  return `Xong: ${s.proposals} đề xuất mới, ${s.reminders} nhắc việc${outdated}${skipped ? `. Bỏ qua — ${skipped}` : ''}.`;
}

/** Dải trạng thái Agent: công tắc Bật/Tắt tự quét, Quét ngay, lần chạy gần nhất, mức dùng giới hạn hôm nay */
export default function AgentStatusBar({
  paused,
  lastRunAt,
  lastRunError,
  running,
  connected,
  error,
  schedule,
  onRunNow,
  onTogglePause,
  actions,
  proposals,
  guardrails,
  activeRules,
}: AgentStatusBarProps) {
  const [result, setResult] = useState<string | null>(null);
  const canConfigure = useAuth().can('configure');
  // Đề xuất hôm nay (còn hiệu lực) + thao tác thật hôm nay (không tính nhắc việc) — cùng cách đếm với server
  const todayProposals = proposals.filter((p) => isToday(p.createdAt) && (p.status === 'pending' || p.status === 'approved'));
  const todayActions = actions.filter((a) => isToday(a.executedAt) && a.status !== 'failed' && a.actionType !== 'remind');
  const boostToday = todayProposals
    .filter((p) => p.actionType === 'boost_creative')
    .reduce((acc, p) => acc + (p.params.boostBudget ?? 0), 0);
  const active = connected && !paused && activeRules > 0;
  const impact30 = impactTotal(actions, guardrails.evaluateAfterHours, '30d');

  const stats = [
    { label: 'Lần chạy gần nhất', value: lastRunAt ? formatDateTime(lastRunAt) : 'Chưa chạy lần nào' },
    { label: 'Tăng cường hôm nay', value: `${shortVnd(boostToday)} / ${shortVnd(guardrails.dailyBoostCap)}` },
    {
      label: 'Thao tác hôm nay',
      value: `${formatNumber(todayProposals.length + todayActions.length)} / ${formatNumber(guardrails.maxActionsPerDay)}`,
    },
    { label: 'Hiệu quả 30 ngày', value: impact30 == null ? '--' : `${signedVnd(impact30)} (ước tính)` },
  ];

  const on = connected && !paused;
  const subtitle = !connected
    ? 'Chưa kết nối server — chạy npm run server'
    : paused
      ? 'Đã tắt — Agent không tự quét. Bật lại để Agent xét quy tắc mỗi giờ.'
      : activeRules === 0
        ? 'Đang bật nhưng chưa có quy tắc nào ở chế độ Cần duyệt — vào tab Quy tắc để bật.'
        : `${activeRules} quy tắc đang bật · tự quét mỗi ${schedule.intervalMinutes === 60 ? 'giờ' : `${schedule.intervalMinutes} phút`}${
            schedule.nextRunAt ? ` · lượt tới lúc ${timeOf(schedule.nextRunAt)}` : ''
          } · Sếp duyệt + xác nhận thì chạy thật trên TikTok`;

  async function runNow() {
    setResult(null);
    const s = await onRunNow();
    if (s) setResult(summaryText(s));
  }

  const problem = error ?? lastRunError;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`flex size-11 items-center justify-center rounded-xl ${
              active ? 'bg-violet-50 text-accent-violet' : 'bg-canvas text-muted'
            }`}
          >
            <Bot className="size-6" />
          </span>
          <div>
            <p className="flex items-center gap-2 font-semibold">
              AI Agent
              {running && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                  <Loader2 className="size-3 animate-spin" />
                  Đang lấy số liệu & quét…
                </span>
              )}
            </p>
            <p className="text-sm text-muted">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={runNow}
            disabled={!on || running || !canConfigure}
            title={!canConfigure ? 'Tài khoản không có quyền' : on ? 'Lấy số liệu mới từ TikTok rồi xét quy tắc ngay' : 'Bật Agent để quét'}
            className="flex w-fit items-center gap-2 whitespace-nowrap rounded-xl border border-line px-3.5 py-2 text-sm font-medium text-muted transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${running ? 'animate-spin' : ''}`} />
            Quét ngay
          </button>

          {/* Công tắc Bật/Tắt tự quét (thay cho nút Tạm dừng / Tiếp tục) */}
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Bật/tắt tự quét của Agent"
            onClick={onTogglePause}
            disabled={!connected || !canConfigure}
            title={canConfigure ? undefined : 'Tài khoản không có quyền'}
            className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              on ? 'border-accent-green/30 bg-green-50 text-accent-green' : 'border-line bg-white text-muted hover:bg-canvas'
            }`}
          >
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-accent-green' : 'bg-muted/40'}`}
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all ${on ? 'left-[18px]' : 'left-0.5'}`}
              />
            </span>
            {on ? 'Đang bật' : 'Đã tắt'}
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-xs text-muted">{s.label}</dt>
            <dd className="text-sm font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      {(problem || result) && (
        <p
          className={`flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm ${
            problem ? 'bg-rose-50 text-danger' : 'bg-primary-soft text-primary'
          }`}
          aria-live="polite"
        >
          {problem && <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          {problem ? `Lỗi: ${problem}` : result}
        </p>
      )}
    </Card>
  );
}
