import crypto from 'node:crypto';
import {
  ineligibleReason,
  matchRuleTrend,
  RECOVERING_REASON,
  UNCONFIRMED_REASON,
  type ConfirmedTarget,
  type ConfirmSnaps,
  type RuleTarget,
} from '../../shared/agentMatch.js';
import type { AdsSnapshot } from '../../shared/adsSnapshot.js';
import type {
  AgentActionLog,
  AgentActionType,
  AgentConfig,
  AgentGuardrails,
  AgentProposal,
  AgentRuntime,
  AgentTarget,
  MetricWindow,
} from '../../shared/agentTypes.js';
import { shortVnd } from '../../shared/format.js';
import type { AdsSettings } from '../../shared/settings.js';
import { getSnapshot, todayVN } from '../ads/cache.js';
import { getAgentConfig, getSettings, updateRuntime } from '../store.js';

/**
 * Một lượt chạy của Agent: CHỈ ĐỌC số liệu, tạo đề xuất (chờ Sếp duyệt) và ghi nhắc việc.
 * Không gọi tool ghi — thực thi nằm ở executor.ts, chỉ chạy khi Sếp bấm Duyệt + Xác nhận.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PROPOSAL_TTL_HOURS = 24;

export interface RunSummary {
  ranAt: string;
  skipped?: 'paused';
  range?: { from: string; to: string };
  proposals: number;
  reminders: number;
  expired: number;
  /** Đề xuất đang chờ bị huỷ vì số liệu mới không còn khớp */
  outdated: number;
  /** Số đối tượng bị bỏ qua theo lý do */
  skippedTargets: Record<string, number>;
}

const vnDate = (offsetDays: number) => new Date(Date.parse(todayVN()) - offsetDays * DAY).toISOString().slice(0, 10);

const keyOf = (type: AgentActionType, t: AgentTarget) => `${type}|${t.campaignId}|${t.productId}|${t.videoId}`;

/** Thời điểm bắt đầu ngày hôm nay theo giờ VN (ms) */
const startOfTodayVN = () => Date.parse(`${todayVN()}T00:00:00+07:00`);

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

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Số liệu hiện tại của đối tượng trong snapshot (để ghi lý do khi không còn khớp) */
function currentText(t: AgentTarget, snapshot: AdsSnapshot): string {
  let cost = 0;
  let revenue = 0;
  let found = false;
  const add = (c: number | null, r: number | null) => {
    found = true;
    cost += c ?? 0;
    revenue += r ?? 0;
  };
  if (t.videoId) {
    for (const v of snapshot.videos) if (v.campaignId === t.campaignId && v.id === t.videoId) add(v.cost, v.revenue);
  } else if (t.productId) {
    for (const p of snapshot.products) if (p.campaignId === t.campaignId && p.id === t.productId) add(p.cost, p.revenue);
  } else {
    for (const c of snapshot.campaigns) if (c.id === t.campaignId) add(c.cost, c.revenue);
  }
  if (!found) return 'không còn trong số liệu';
  const roi = cost > 0 ? (revenue / cost).toFixed(2).replace('.', ',') : '--';
  return `chi ${shortVnd(cost)} · ROI ${roi}`;
}

/**
 * Đề xuất còn khớp quy tắc theo số liệu `snapshot` không.
 * Dùng ở mỗi lượt quét (xét lại đề xuất đang chờ) và ngay trước khi thực thi.
 */
export function recheckProposal(
  p: AgentProposal,
  cfg: AgentConfig,
  settings: AdsSettings,
  snapshot: AdsSnapshot,
  /** Khung 14 / 30 ngày để xác nhận (thiếu = chỉ xét 1 khung) */
  confirm: ConfirmSnaps = { d14: null, d30: null },
): { ok: true; match: ConfirmedTarget } | { ok: false; reason: string } {
  const rule = cfg.rules.find((r) => r.id === p.ruleId);
  if (!rule) return { ok: false, reason: 'Quy tắc đã bị xoá' };
  if (rule.mode === 'off') return { ok: false, reason: 'Quy tắc đã tắt' };
  if (!rule.trigger) return { ok: false, reason: 'Quy tắc chưa chọn nhóm' };
  const k = keyOf(p.actionType, p.target);
  // Đủ 3 khung: đã xác nhận (7 = 14) + lỗ âm thầm (14 + 30, 7 ngày chi ít); dấu hiệu / đang hồi phục → không làm
  const sameTarget = (t: RuleTarget) => keyOf(rule.actionType, t.target) === k;
  const r = matchRuleTrend(rule, settings, snapshot, confirm);
  const match = r.kept.find(sameTarget);
  if (!match) {
    if (r.unconfirmed.some(sameTarget)) return { ok: false, reason: `${UNCONFIRMED_REASON} — chờ thêm, chưa nên làm lúc này` };
    if (r.recovering.some(sameTarget)) return { ok: false, reason: RECOVERING_REASON };
    const range = snapshot.range ? `Số liệu ${ddmm(snapshot.range.from)}–${ddmm(snapshot.range.to)}` : 'Số liệu mới';
    return { ok: false, reason: `${range}:${currentText(p.target, snapshot)} — không còn khớp quy tắc «${rule.name}»` };
  }
  const why = ineligibleReason(rule.actionType, rule.params, match);
  if (why) return { ok: false, reason: why };
  return { ok: true, match };
}

/**
 * Snapshot 14 + 30 ngày đến hôm qua để xác nhận (cache server; Quét ngay lấy mới khung 14 ngày).
 * Sếp tắt xác nhận / lỗi đọc → null (chỉ xét 1 khung như cũ).
 */
export async function loadConfirmSnaps(guardrails: AgentGuardrails, fresh = false): Promise<ConfirmSnaps> {
  if (guardrails.confirmWindow === false) return { d14: null, d30: null };
  const read = (days: number, f: boolean) =>
    getSnapshot({ from: vnDate(days), to: vnDate(1) }, f)
      .then((r) => r.snapshot)
      .catch(() => null);
  const [d14, d30] = await Promise.all([read(14, fresh), read(30, false)]);
  return { d14, d30 };
}

/** Ghi số 14 / 30 ngày + "kéo dài" vào đề xuất */
function applyWindows(p: AgentProposal, t: ConfirmedTarget) {
  if (t.windows) p.windows = t.windows;
  else delete p.windows;
  if (t.long !== undefined) p.long = t.long;
  else delete p.long;
  if (t.slowLoss) p.slowLoss = true;
  else delete p.slowLoss;
}

/** fresh = lấy số liệu mới từ TikTok (bỏ qua cache) — dùng cho "Quét ngay" */
export async function runAgent(opts?: { fresh?: boolean }): Promise<RunSummary> {
  const cfg = getAgentConfig();
  const ranAt = new Date().toISOString();
  const summary: RunSummary = { ranAt, proposals: 0, reminders: 0, expired: 0, outdated: 0, skippedTargets: {} };
  const skip = (reason: string) => (summary.skippedTargets[reason] = (summary.skippedTargets[reason] ?? 0) + 1);

  if (cfg.paused) return { ...summary, skipped: 'paused' };

  const { guardrails } = cfg;
  const lookback = Math.max(1, guardrails.lookbackDays ?? 7);
  // Xét n ngày gần nhất tính đến hôm qua (ngày đã đủ số)
  const range = { from: vnDate(lookback), to: vnDate(1) };
  summary.range = range;
  const { snapshot } = await getSnapshot(range, opts?.fresh === true);
  const confirm = await loadConfirmSnaps(guardrails, opts?.fresh === true);
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

    // Xét lại đề xuất đang chờ theo số liệu mới: không còn khớp → tự huỷ; còn khớp → cập nhật số
    for (const p of rt.proposals) {
      if (p.status !== 'pending') continue;
      const r = recheckProposal(p, cfg, settings, snapshot, confirm);
      if (r.ok) {
        p.before = windowOf(r.match, range);
        p.reason = r.match.reason;
        if (r.match.offset) p.offset = r.match.offset;
        else delete p.offset;
        applyWindows(p, r.match);
      } else {
        p.status = 'outdated';
        p.decidedAt = ranAt;
        p.note = r.reason;
        summary.outdated++;
      }
    }

    const todayStart = startOfTodayVN();
    const isToday = (iso: string) => Date.parse(iso) >= todayStart;
    // Số thao tác hôm nay: đề xuất còn hiệu lực tạo hôm nay (đã duyệt mà có thực thi thì tính ở nhật ký)
    // + thao tác thật đã chạy (trừ nhắc việc, lỗi, hoàn tác)
    const liveProposal = (p: AgentProposal) =>
      isToday(p.createdAt) && (p.status === 'pending' || (p.status === 'approved' && !p.actionId));
    const realAction = (a: AgentActionLog) =>
      isToday(a.executedAt) && a.actionType !== 'remind' && a.status !== 'failed' && !a.undoOf;
    let todayCount = rt.proposals.filter(liveProposal).length + rt.actions.filter(realAction).length;
    let todayBoost =
      rt.proposals.filter((p) => liveProposal(p) && p.actionType === 'boost_creative').reduce((s, p) => s + (p.params.boostBudget ?? 0), 0) +
      rt.actions.filter((a) => realAction(a) && a.actionType === 'boost_creative').reduce((s, a) => s + (a.params.boostBudget ?? 0), 0);

    // Lần gần nhất đụng tới (loại hành động, đối tượng): đề xuất hoặc nhật ký
    const lastTouched = new Map<string, number>();
    const pendingKeys = new Set<string>();
    const touch = (k: string, iso: string) => lastTouched.set(k, Math.max(lastTouched.get(k) ?? 0, Date.parse(iso)));
    for (const p of rt.proposals) {
      const k = keyOf(p.actionType, p.target);
      if (p.status === 'pending') pendingKeys.add(k);
      // Hết hạn / không còn khớp: không tính thời gian chờ
      if (p.status !== 'expired' && p.status !== 'outdated') touch(k, p.createdAt);
    }
    // Lệnh lỗi (chưa chạy được trên TikTok): không tính thời gian chờ
    for (const a of rt.actions) if (a.status !== 'failed') touch(keyOf(a.actionType, a.target), a.executedAt);

    for (const rule of cfg.rules) {
      if (rule.mode === 'off' || !rule.trigger) continue;
      const cooldownMs = (rule.cooldownHours ?? guardrails.cooldownHours) * HOUR;

      // Chỉ đối tượng đã xác nhận bằng khung 14 ngày (Sếp chốt 22/11); còn lại ghi "bỏ qua"
      const { kept, unconfirmed, recovering } = matchRuleTrend(rule, settings, snapshot, confirm);
      unconfirmed.forEach(() => skip(UNCONFIRMED_REASON));
      recovering.forEach(() => skip(RECOVERING_REASON));
      for (const t of kept) {
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

        const why = ineligibleReason(rule.actionType, rule.params, t);
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
          ...(t.offset && { offset: t.offset }),
          ...(t.windows && { windows: t.windows }),
          ...(t.long !== undefined && { long: t.long }),
          ...(t.slowLoss && { slowLoss: true }),
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
