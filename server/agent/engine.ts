import crypto from 'node:crypto';
import { findRuleTargets, type RuleTarget } from '../../shared/agentMatch.js';
import type {
  AgentActionLog,
  AgentActionType,
  AgentProposal,
  AgentRule,
  AgentRuntime,
  AgentTarget,
  MetricWindow,
} from '../../shared/agentTypes.js';
import { getSnapshot, todayVN } from '../ads/cache.js';
import { getAgentConfig, getSettings, updateRuntime } from '../store.js';

/**
 * Một lượt chạy của Agent — GIAI ĐOẠN B: CHỈ ĐỌC.
 * Tạo đề xuất (chờ Sếp duyệt) và ghi nhắc việc. KHÔNG gọi tool ghi nào của TikTok,
 * kể cả với quy tắc đặt "Tự chạy" (giai đoạn C/D mới thực thi, cần Sếp xác nhận).
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PROPOSAL_TTL_HOURS = 24;

/** Video ở các trạng thái này TikTok không cho tăng cường */
const NO_BOOST_STATUSES = new Set(['authorization_needed', 'excluded', 'rejected', 'unavailable']);

export interface RunSummary {
  ranAt: string;
  skipped?: 'paused';
  range?: { from: string; to: string };
  proposals: number;
  reminders: number;
  expired: number;
  /** Số đối tượng bị bỏ qua theo lý do */
  skippedTargets: Record<string, number>;
}

const vnDate = (offsetDays: number) => new Date(Date.parse(todayVN()) - offsetDays * DAY).toISOString().slice(0, 10);

const keyOf = (type: AgentActionType, t: AgentTarget) => `${type}|${t.campaignId}|${t.productId}|${t.videoId}`;

/** Thời điểm bắt đầu ngày hôm nay theo giờ VN (ms) */
const startOfTodayVN = () => Date.parse(`${todayVN()}T00:00:00+07:00`);

/** Lý do không được đề xuất (theo điều kiện của TikTok / giới hạn an toàn); null = được */
function ineligible(rule: AgentRule, t: RuleTarget): string | null {
  switch (rule.actionType) {
    case 'remove_creative':
      if (!t.campaignRunning) return 'Chiến dịch đang tắt';
      if (t.videoStatus === 'excluded') return 'Video đã bị gỡ';
      return null;
    case 'add_creative':
      return t.videoStatus === 'excluded' ? null : 'Video chưa bị gỡ';
    case 'boost_creative':
      if (!t.campaignRunning) return 'Chiến dịch đang tắt';
      if (t.videoStatus && NO_BOOST_STATUSES.has(t.videoStatus)) return 'Video không đủ điều kiện tăng cường';
      if (!rule.params.boostBudget) return 'Quy tắc chưa đặt ngân sách tăng cường';
      return null;
    case 'update_budget':
      return rule.params.budgetChangePct ? null : 'Quy tắc chưa đặt % ngân sách';
    case 'update_roi_target':
      return rule.params.roiTargetChangePct ? null : 'Quy tắc chưa đặt % ROI mục tiêu';
    default:
      return null;
  }
}

function windowOf(t: RuleTarget, range: { from: string; to: string }): MetricWindow {
  return {
    from: `${range.from}T00:00:00+07:00`,
    to: `${range.to}T23:59:59+07:00`,
    cost: t.cost,
    revenue: t.revenue,
    orders: t.orders,
    roi: t.roi,
    breakEven: t.breakEven,
  };
}

/** fresh = lấy số liệu mới từ TikTok (bỏ qua cache) — dùng cho "Quét ngay" */
export async function runAgent(opts?: { fresh?: boolean }): Promise<RunSummary> {
  const cfg = getAgentConfig();
  const ranAt = new Date().toISOString();
  const summary: RunSummary = { ranAt, proposals: 0, reminders: 0, expired: 0, skippedTargets: {} };
  const skip = (reason: string) => (summary.skippedTargets[reason] = (summary.skippedTargets[reason] ?? 0) + 1);

  if (cfg.paused) return { ...summary, skipped: 'paused' };

  const { guardrails } = cfg;
  const lookback = Math.max(1, guardrails.lookbackDays ?? 7);
  // Xét n ngày gần nhất tính đến hôm qua (ngày đã đủ số)
  const range = { from: vnDate(lookback), to: vnDate(1) };
  summary.range = range;
  const { snapshot } = await getSnapshot(range, opts?.fresh === true);
  const settings = getSettings();
  const now = Date.now();

  updateRuntime((rt: AgentRuntime) => {
    // Đề xuất quá hạn
    for (const p of rt.proposals) {
      if (p.status === 'pending' && Date.parse(p.expiresAt) < now) {
        p.status = 'expired';
        summary.expired++;
      }
    }

    const todayStart = startOfTodayVN();
    const isToday = (iso: string) => Date.parse(iso) >= todayStart;
    // Số thao tác hôm nay: đề xuất tạo hôm nay (trừ bị bỏ qua / hết hạn) + thao tác thật đã chạy (trừ nhắc việc)
    let todayCount =
      rt.proposals.filter((p) => isToday(p.createdAt) && (p.status === 'pending' || p.status === 'approved')).length +
      rt.actions.filter((a) => isToday(a.executedAt) && a.actionType !== 'remind' && a.status !== 'failed').length;
    let todayBoost = rt.proposals
      .filter((p) => isToday(p.createdAt) && p.actionType === 'boost_creative' && p.status !== 'rejected' && p.status !== 'expired')
      .reduce((s, p) => s + (p.params.boostBudget ?? 0), 0);

    // Lần gần nhất đụng tới (loại hành động, đối tượng): đề xuất hoặc nhật ký
    const lastTouched = new Map<string, number>();
    const pendingKeys = new Set<string>();
    const touch = (k: string, iso: string) => lastTouched.set(k, Math.max(lastTouched.get(k) ?? 0, Date.parse(iso)));
    for (const p of rt.proposals) {
      const k = keyOf(p.actionType, p.target);
      if (p.status === 'pending') pendingKeys.add(k);
      if (p.status !== 'expired') touch(k, p.createdAt);
    }
    for (const a of rt.actions) touch(keyOf(a.actionType, a.target), a.executedAt);

    for (const rule of cfg.rules) {
      if (rule.mode === 'off' || !rule.trigger) continue;
      const cooldownMs = (rule.cooldownHours ?? guardrails.cooldownHours) * HOUR;

      for (const t of findRuleTargets(rule, settings, snapshot)) {
        const k = keyOf(rule.actionType, t.target);
        if (pendingKeys.has(k)) {
          skip('Đã có đề xuất đang chờ');
          continue;
        }
        if (now - (lastTouched.get(k) ?? 0) < cooldownMs) {
          skip('Đang trong thời gian chờ');
          continue;
        }

        if (rule.actionType === 'remind') {
          const log: AgentActionLog = {
            id: crypto.randomUUID(),
            executedAt: ranAt,
            actor: 'agent',
            ruleId: rule.id,
            actionType: 'remind',
            target: t.target,
            params: {},
            before: windowOf(t, range),
            after: null,
            status: 'success',
          };
          rt.actions.unshift(log);
          touch(k, ranAt);
          summary.reminders++;
          continue;
        }

        const why = ineligible(rule, t);
        if (why) {
          skip(why);
          continue;
        }
        if (todayCount >= guardrails.maxActionsPerDay) {
          skip('Đủ số thao tác tối đa hôm nay');
          continue;
        }
        if (rule.actionType === 'boost_creative') {
          const budget = rule.params.boostBudget ?? 0;
          if (todayBoost + budget > guardrails.dailyBoostCap) {
            skip('Vượt trần tăng cường hôm nay');
            continue;
          }
          todayBoost += budget;
        }

        // Đổi ngân sách vượt giới hạn %/ngày → chỉ đề xuất đúng mức giới hạn
        const params = { ...rule.params };
        if (params.budgetChangePct != null) {
          params.budgetChangePct = Math.max(
            -guardrails.maxBudgetDecreasePct,
            Math.min(guardrails.maxBudgetIncreasePct, params.budgetChangePct),
          );
        }

        const proposal: AgentProposal = {
          id: crypto.randomUUID(),
          createdAt: ranAt,
          expiresAt: new Date(now + PROPOSAL_TTL_HOURS * HOUR).toISOString(),
          ruleId: rule.id,
          actionType: rule.actionType,
          target: t.target,
          params,
          reason: t.reason,
          before: windowOf(t, range),
          status: 'pending',
          ruleMode: rule.mode,
          ...(rule.mode === 'auto' && {
            note: 'Quy tắc đặt Tự chạy nhưng Agent chưa được bật thực thi trên TikTok → chờ Sếp duyệt',
          }),
        };
        rt.proposals.unshift(proposal);
        pendingKeys.add(k);
        touch(k, ranAt);
        todayCount++;
        summary.proposals++;
      }
    }

    rt.lastRunAt = ranAt;
    rt.lastRunError = null;
    // Giữ nhật ký / đề xuất gọn: tối đa 2000 dòng mỗi loại
    rt.proposals = rt.proposals.slice(0, 2000);
    rt.actions = rt.actions.slice(0, 2000);
  });

  return summary;
}
