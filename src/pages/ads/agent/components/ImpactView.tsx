import { useMemo, useState } from 'react';
import { Activity, CircleDollarSign, Info, PiggyBank, Target, TrendingUp } from 'lucide-react';
import SegmentedControl from '../../../../components/ui/SegmentedControl';
import StatCard from '../../../../components/ui/StatCard';
import { formatDateTime, formatNumber, shortVnd } from '../../../../lib/format';
import EmptyTableState from '../../components/EmptyTableState';
import {
  evaluateAction,
  inPeriod,
  lessons as buildLessons,
  ruleStats,
  summarize,
  type LessonTarget,
  type Period,
} from '../evaluate';
import { useAdsData } from '../../data';
import { describeTarget } from '../lookup';
import { ACTION_TYPE_META } from '../meta';
import type { AgentActionLog, AgentProposal, AgentRule } from '../types';
import LessonList from './LessonList';
import RuleImpactTable from './RuleImpactTable';
import VerdictBadge, { signedVnd } from './VerdictBadge';

interface ImpactViewProps {
  actions: AgentActionLog[];
  proposals: AgentProposal[];
  rules: AgentRule[];
  evaluateAfterHours: number;
  groupName: (id: string) => string;
  onGoto: (target: LessonTarget | 'log') => void;
}

const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: 'all', label: 'Tất cả' },
];

const pct = (x: number | null) => (x == null ? '--' : `${Math.round(x * 100)}%`);
const money = (n: number | null) => (n == null ? '--' : signedVnd(n));

/** Tab "Hiệu quả": Agent làm đúng/sai bao nhiêu, lời/lỗ ước tính, gợi ý chỉnh quy tắc */
export default function ImpactView({ actions, proposals, rules, evaluateAfterHours, groupName, onGoto }: ImpactViewProps) {
  const { snapshot } = useAdsData();
  const [period, setPeriod] = useState<Period>('30d');

  const list = useMemo(
    () =>
      actions
        .filter((a) => inPeriod(a.executedAt, period))
        .map((action) => ({ action, ev: evaluateAction(action, evaluateAfterHours) })),
    [actions, period, evaluateAfterHours],
  );
  const summary = summarize(list);
  const stats = ruleStats(
    rules,
    list,
    proposals.filter((p) => inPeriod(p.createdAt, period)),
  );
  const lessonList = buildLessons(stats, groupName);
  const ruleName = (id: string | null) => (id ? (rules.find((r) => r.id === id)?.name ?? id) : 'Thủ công');

  const scored = list
    .filter((x) => x.ev.profitEffect != null)
    .sort((a, b) => (b.ev.profitEffect ?? 0) - (a.ev.profitEffect ?? 0));
  const best = scored.filter((x) => (x.ev.profitEffect ?? 0) >= 0).slice(0, 3);
  const worst = scored.filter((x) => (x.ev.profitEffect ?? 0) < 0).reverse().slice(0, 3);

  return (
    <div className="space-y-6 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} ariaLabel="Khoảng thời gian" />
        <details className="group text-sm sm:max-w-md">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-muted hover:text-ink">
            <Info className="size-4" />
            Cách tính (ước tính)
          </summary>
          <div className="mt-2 space-y-1 rounded-xl bg-canvas/70 p-3 text-xs leading-relaxed text-muted">
            <p>
              <b>Mốc “nếu không làm gì”</b> = chi phí / doanh thu mỗi ngày trước thao tác × số ngày sau thao tác.
            </p>
            <p>
              <b>Lợi nhuận từ quảng cáo</b> = doanh thu ÷ ROI hoà vốn − chi phí (hoà vốn ghi lúc quyết định).
            </p>
            <p>
              <b>Gỡ video</b>: chi phí tránh được − doanh thu mất ÷ hoà vốn. <b>Tăng cường</b>: doanh thu thêm ÷ hoà vốn − chi
              thêm.
            </p>
            <p>
              Đúng nếu tác động ≥ 0, Sai nếu &lt; 0. Chỉ chấm sau {evaluateAfterHours} giờ. Thiếu hoà vốn → chưa chấm được.
            </p>
          </div>
        </details>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Lợi nhuận tác động" value={money(summary.profitEffect)} icon={CircleDollarSign} tone="green" hint="Ước tính" />
        <StatCard label="Tỷ lệ đúng" value={pct(summary.accuracy)} icon={Target} tone="blue" hint={`${summary.good} đúng · ${summary.bad} sai`} />
        <StatCard
          label="Chi phí tránh được"
          value={summary.avoidedCost == null ? '--' : shortVnd(summary.avoidedCost)}
          icon={PiggyBank}
          tone="violet"
          hint="Từ gỡ video"
        />
        <StatCard label="Doanh thu thêm" value={money(summary.extraRevenue)} icon={TrendingUp} tone="amber" hint="Từ tăng cường / thêm lại / ngân sách" />
        <StatCard
          label="Thao tác"
          value={formatNumber(summary.total)}
          icon={Activity}
          tone="blue"
          hint={`${summary.pending} chờ đánh giá · ${summary.unscorable} chưa chấm được`}
        />
      </div>

      {list.length === 0 ? (
        <EmptyTableState
          title="Chưa có thao tác để đánh giá"
          description="Khi Agent gỡ video, tăng cường hay đổi ngân sách, kết quả sẽ được chấm Đúng/Sai tại đây sau khi đủ thời gian theo dõi."
        />
      ) : (
        <>
          <section className="space-y-3">
            <h3 className="font-semibold">Rút kinh nghiệm</h3>
            <LessonList lessons={lessonList} rules={rules} onGoto={onGoto} />
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold">Theo quy tắc</h3>
            <RuleImpactTable stats={stats} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            {[
              { title: 'Thao tác hiệu quả nhất', items: best },
              { title: 'Thao tác sai nhiều nhất', items: worst },
            ].map((block) => (
              <div key={block.title} className="space-y-2">
                <h3 className="font-semibold">{block.title}</h3>
                {block.items.length === 0 ? (
                  <p className="rounded-xl bg-canvas/70 px-4 py-3 text-sm text-muted">Chưa có</p>
                ) : (
                  <ul className="divide-y divide-line rounded-2xl border border-line">
                    {block.items.map(({ action, ev }) => {
                      const info = describeTarget(snapshot, action.target);
                      return (
                        <li key={action.id}>
                          <button
                            type="button"
                            onClick={() => onGoto('log')}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas/50"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium" title={info.title}>
                                {info.title}
                              </p>
                              <p className="truncate text-xs text-muted">
                                {ACTION_TYPE_META[action.actionType].label} · {ruleName(action.ruleId)} ·{' '}
                                {formatDateTime(action.executedAt)}
                              </p>
                            </div>
                            <VerdictBadge ev={ev} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
