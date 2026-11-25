import crypto from 'node:crypto';
import type { VideoStatus } from '../../shared/adsSnapshot.js';
import type { ActorRef } from '../../shared/permissions.js';
import {
  CREATIVE_INLINE_CHECKS_MS,
  CREATIVE_VERIFY_FAST_MIN,
  CREATIVE_VERIFY_MAX_SEC,
  CREATIVE_VERIFY_MIN_SEC,
  CREATIVE_VERIFY_TIMEOUT_MIN,
  AUTO_MODE_ENABLED,
  EXECUTION_ENABLED,
  MIN_BOOST_BUDGET_VND,
} from '../../shared/agentPolicy.js';
import type {
  AgentActionLog,
  AgentActionType,
  AgentRuleParams,
  AgentRuntime,
  AgentTarget,
  ExecutedValues,
} from '../../shared/agentTypes.js';
import { getSnapshot, todayVN } from '../ads/cache.js';
import { videoStatus, type ReportRow } from '../ads/mapping.js';
import { requireAccount } from '../tiktok/link.js';
import { callReadTool } from '../tiktok/mcpClient.js';
import { callWriteTool, type WriteTool } from '../tiktok/writeTools.js';
import { getAgentConfig, getRuntime, getSettings, updateRuntime } from '../store.js';
import { loadConfirmSnaps, recheckProposal } from './engine.js';

/**
 * GIAI ĐOẠN C — thực thi thật trên TikTok.
 * Chỉ chạy khi Sếp bấm Duyệt + Xác nhận trên web (route kiểm tra `confirm: true`).
 * Mỗi lần chỉ 1 việc (hàng đợi), kiểm tra lại điều kiện bằng số liệu mới ngay trước khi gửi lệnh.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MIN = 60_000;

/** Không đạt điều kiện → không gửi lệnh nào lên TikTok */
export class PrecheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrecheckError';
  }
}

export interface ExecResult {
  action: AgentActionLog;
  message: string;
}

/** Thông tin chiến dịch từ campaign_gmv_max_info_get (chỉ các trường dùng tới) */
export interface CampaignInfo {
  campaign_id: string;
  campaign_name?: string;
  operation_status?: string;
  store_id?: string;
  budget?: number;
  roas_bid?: number;
  deep_bid_type?: string;
  product_specific_type?: string;
  product_video_specific_type?: string;
  item_group_ids?: string[];
}

/** Video ở các trạng thái này TikTok không cho tăng cường */
const NO_BOOST: VideoStatus[] = ['authorization_needed', 'excluded', 'rejected', 'unavailable'];

/* ───────── Hàng đợi: mỗi lần 1 việc ───────── */

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/* ───────── Đọc số liệu mới từ TikTok ───────── */

const vnDate = (offsetDays: number) => new Date(Date.parse(todayVN()) - offsetDays * DAY).toISOString().slice(0, 10);

export function getCampaignInfo(campaignId: string): Promise<CampaignInfo> {
  return callReadTool<CampaignInfo>('campaign_gmv_max_info_get', {
    advertiser_id: requireAccount().advertiserId,
    campaign_id: campaignId,
  });
}

/** Trạng thái hiện tại của video trong chiến dịch (theo sản phẩm); null nếu không tìm thấy */
export async function getVideoStatus(campaignId: string, productId: string, videoId: string): Promise<VideoStatus | null> {
  for (let page = 1; page <= 5; page++) {
    const data = await callReadTool<{ list?: ReportRow[]; page_info?: { total_page: number } }>('gmv_max_report_get', {
      advertiser_id: requireAccount().advertiserId,
      store_ids: [requireAccount().storeId],
      start_date: vnDate(6),
      end_date: todayVN(),
      page,
      page_size: 1000,
      dimensions: ['item_id'],
      metrics: ['creative_delivery_status'],
      filtering: { campaign_ids: [campaignId], item_group_ids: [productId] },
    });
    const row = data.list?.find((r) => r.dimensions.item_id === videoId);
    if (row) return videoStatus(row.metrics.creative_delivery_status);
    if (!data.page_info || page >= data.page_info.total_page) break;
  }
  return null;
}

/** Mọi sản phẩm mà video gắn trong chiến dịch (theo snapshot Agent đang dùng) */
async function spuIdsOf(target: AgentTarget): Promise<string[]> {
  const lookback = Math.max(1, getAgentConfig().guardrails.lookbackDays ?? 7);
  const ids = new Set<string>([target.productId]);
  try {
    const { snapshot } = await getSnapshot({ from: vnDate(lookback), to: vnDate(1) }, false);
    for (const v of snapshot.videos) {
      if (v.id !== target.videoId) continue;
      if (v.campaignId === target.campaignId) ids.add(v.productId);
      // Dòng thật của video có thể bị lọc khỏi snapshot (0 chi) → lấy từ nhãn "cần ủy quyền giả"
      if (v.crossProduct && v.mainCampaignId === target.campaignId && v.mainProductId) ids.add(v.mainProductId);
    }
  } catch {
    // thiếu snapshot → dùng sản phẩm của đề xuất
  }
  return [...ids].filter(Boolean);
}

/* ───────── Dựng lệnh ───────── */

interface Plan {
  tool: WriteTool;
  params: Record<string, unknown>;
  prev: ExecutedValues;
  next: ExecutedValues;
  /** creative = đọc trạng thái video ngay, chưa khớp thì tự kiểm tra lại giãn dần; readback = đọc lại thông tin chiến dịch; none = TikTok trả OK là xong */
  verify: 'creative' | 'readback' | 'none';
  /** Mô tả cho Sếp */
  summary: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`;

/** "YYYY-MM-DD HH:MM:SS" giờ UTC */
const utcStamp = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

async function planCreative(
  info: CampaignInfo,
  target: AgentTarget,
  action: 'REMOVE' | 'ADD',
): Promise<Plan> {
  if (info.product_video_specific_type !== 'AUTO_SELECTION') {
    throw new PrecheckError('Chiến dịch không ở chế độ tự chọn video (AUTO_SELECTION) — TikTok không cho gỡ / thêm từng video');
  }
  if (!target.videoId) throw new PrecheckError('Đề xuất thiếu ID video');
  const status = await getVideoStatus(target.campaignId, target.productId, target.videoId);
  if (!status) throw new PrecheckError('Không tìm thấy video trong chiến dịch (7 ngày gần nhất)');
  if (action === 'REMOVE' && status === 'excluded') throw new PrecheckError('Video đã bị gỡ khỏi chiến dịch rồi');
  if (action === 'ADD' && status !== 'excluded') throw new PrecheckError('Video đang không bị gỡ — không cần thêm lại');
  const spuIds = await spuIdsOf(target);
  return {
    tool: 'gmv_max_creative_update',
    params: {
      advertiser_id: requireAccount().advertiserId,
      campaign_id: target.campaignId,
      action,
      item_list: [{ item_id: target.videoId, spu_id_list: spuIds }],
    },
    prev: { spuIds },
    next: { spuIds },
    verify: 'creative',
    summary: action === 'REMOVE' ? 'Đã gửi lệnh gỡ video' : 'Đã gửi lệnh thêm lại video',
  };
}

async function planBoost(info: CampaignInfo, target: AgentTarget, params: AgentRuleParams): Promise<Plan> {
  const budget = params.boostBudget ?? 0;
  const days = Math.max(1, Math.round(params.boostDays ?? 1));
  if (budget < MIN_BOOST_BUDGET_VND) {
    throw new PrecheckError(`Ngân sách tăng cường ${fmt(budget)} thấp hơn mức tối thiểu của TikTok (~${fmt(MIN_BOOST_BUDGET_VND)}/ngày)`);
  }
  if (!target.videoId || !target.productId) throw new PrecheckError('Đề xuất thiếu ID video / sản phẩm');
  const status = await getVideoStatus(target.campaignId, target.productId, target.videoId);
  if (!status) throw new PrecheckError('Không tìm thấy video trong chiến dịch (7 ngày gần nhất)');
  if (NO_BOOST.includes(status)) throw new PrecheckError('Video đang ở trạng thái TikTok không cho tăng cường');
  const endsAt = Date.now() + days * DAY;
  return {
    tool: 'campaign_gmv_max_session_create',
    params: {
      advertiser_id: requireAccount().advertiserId,
      campaign_id: target.campaignId,
      store_id: info.store_id ?? requireAccount().storeId,
      session: {
        bid_type: 'CREATIVE_NO_BID',
        item_id: target.videoId,
        product_list: [{ spu_id: target.productId }],
        budget,
        schedule_type: 'SCHEDULE_START_END',
        schedule_end_time: utcStamp(endsAt),
      },
    },
    prev: {},
    next: { boostEndsAt: new Date(endsAt).toISOString() },
    verify: 'none',
    summary: `Đã tạo tăng cường ${fmt(budget)}/ngày × ${days} ngày`,
  };
}

/** Shop phải cấp quyền GMV Max độc quyền cho tài khoản quảng cáo này */
async function requireExclusive() {
  const data = await callReadTool<{
    store_list?: { store_id: string; exclusive_authorized_advertiser_info?: { advertiser_id?: string } }[];
  }>('gmv_max_store_list_get', { advertiser_id: requireAccount().advertiserId });
  const ok = data.store_list?.some(
    (s) =>
      s.store_id === requireAccount().storeId &&
      s.exclusive_authorized_advertiser_info?.advertiser_id === requireAccount().advertiserId,
  );
  if (!ok) throw new PrecheckError('Shop chưa cấp quyền GMV Max độc quyền cho tài khoản quảng cáo này');
}

function updatePlan(campaignId: string, fields: Record<string, unknown>, prev: ExecutedValues, next: ExecutedValues, summary: string): Plan {
  return {
    tool: 'campaign_gmv_max_update',
    params: { advertiser_id: requireAccount().advertiserId, campaign_id: campaignId, ...fields },
    prev,
    next,
    verify: 'readback',
    summary,
  };
}

/** Kẹp % đổi ngân sách theo giới hạn an toàn */
export function clampBudgetPct(pct: number) {
  const g = getAgentConfig().guardrails;
  return Math.max(-g.maxBudgetDecreasePct, Math.min(g.maxBudgetIncreasePct, pct));
}

async function planBudget(info: CampaignInfo, target: AgentTarget, params: AgentRuleParams): Promise<Plan> {
  const current = info.budget;
  if (!current || current <= 0) throw new PrecheckError('Không đọc được ngân sách hiện tại của chiến dịch');
  const pct = clampBudgetPct(params.budgetChangePct ?? 0);
  if (!pct) throw new PrecheckError('Đề xuất không có % đổi ngân sách');
  await requireExclusive();
  const budget = Math.round((current * (1 + pct / 100)) / 1000) * 1000;
  return updatePlan(
    target.campaignId,
    { budget },
    { budget: current },
    { budget },
    `Ngân sách ${fmt(current)} → ${fmt(budget)}`,
  );
}

async function planRoi(info: CampaignInfo, target: AgentTarget, params: AgentRuleParams): Promise<Plan> {
  if (info.deep_bid_type !== 'VO_MIN_ROAS') throw new PrecheckError('Chiến dịch không đặt ROI mục tiêu (không phải VO_MIN_ROAS)');
  const current = info.roas_bid;
  if (!current || current <= 0) throw new PrecheckError('Không đọc được ROI mục tiêu hiện tại');
  const pct = params.roiTargetChangePct ?? 0;
  if (!pct) throw new PrecheckError('Đề xuất không có % đổi ROI mục tiêu');
  const roasBid = Math.max(0.1, round1(current * (1 + pct / 100)));
  if (roasBid === current) throw new PrecheckError('ROI mục tiêu mới bằng mức hiện tại (sau khi làm tròn 1 chữ số)');
  await requireExclusive();
  return updatePlan(target.campaignId, { roas_bid: roasBid }, { roasBid: current }, { roasBid }, `ROI mục tiêu ${current} → ${roasBid}`);
}

async function planProduct(info: CampaignInfo, target: AgentTarget, enable: boolean): Promise<Plan> {
  if (info.product_specific_type !== 'CUSTOMIZED_PRODUCTS') {
    throw new PrecheckError('Chiến dịch tự chọn sản phẩm — không bật / tắt riêng từng sản phẩm được');
  }
  if (!target.productId) throw new PrecheckError('Đề xuất thiếu ID sản phẩm');
  const ids = info.item_group_ids ?? [];
  const has = ids.includes(target.productId);
  let next: string[];
  if (enable) {
    if (has) throw new PrecheckError('Sản phẩm đang bật trong chiến dịch rồi');
    if (ids.length >= 50) throw new PrecheckError('Chiến dịch đã đủ 50 sản phẩm');
    next = [...ids, target.productId];
  } else {
    if (!has) throw new PrecheckError('Sản phẩm không còn trong chiến dịch');
    next = ids.filter((id) => id !== target.productId);
    if (next.length === 0) throw new PrecheckError('Đây là sản phẩm duy nhất của chiến dịch — tắt sẽ làm chiến dịch rỗng. Hãy tắt chiến dịch trên TikTok nếu cần');
  }
  await requireExclusive();
  return updatePlan(
    target.campaignId,
    { item_group_ids: next },
    { itemGroupIds: ids },
    { itemGroupIds: next },
    enable ? 'Đã bật sản phẩm trong chiến dịch' : 'Đã tắt sản phẩm khỏi chiến dịch',
  );
}

async function buildPlan(actionType: AgentActionType, target: AgentTarget, params: AgentRuleParams): Promise<Plan> {
  if (actionType === 'remind') throw new PrecheckError('Nhắc việc không có thao tác trên TikTok');
  const info = await getCampaignInfo(target.campaignId);
  if (info.operation_status !== 'ENABLE') throw new PrecheckError('Chiến dịch đang tắt trên TikTok');
  switch (actionType) {
    case 'remove_creative':
      return planCreative(info, target, 'REMOVE');
    case 'add_creative':
      return planCreative(info, target, 'ADD');
    case 'boost_creative':
      return planBoost(info, target, params);
    case 'update_budget':
      return planBudget(info, target, params);
    case 'update_roi_target':
      return planRoi(info, target, params);
    case 'disable_product':
      return planProduct(info, target, false);
    case 'enable_product':
      return planProduct(info, target, true);
  }
}

/* ───────── Giới hạn an toàn (theo thao tác thật hôm nay) ───────── */

const startOfTodayVN = () => Date.parse(`${todayVN()}T00:00:00+07:00`);

/** Thao tác thật hôm nay: không tính nhắc việc, lỗi, hoàn tác */
const countsToday = (a: AgentActionLog, todayStart: number) =>
  Date.parse(a.executedAt) >= todayStart && a.actionType !== 'remind' && a.status !== 'failed' && !a.undoOf;

function checkGuardrails(rt: AgentRuntime, actionType: AgentActionType, params: AgentRuleParams) {
  const g = getAgentConfig().guardrails;
  const todayStart = startOfTodayVN();
  const today = rt.actions.filter((a) => countsToday(a, todayStart));
  if (today.length >= g.maxActionsPerDay) {
    throw new PrecheckError(`Đã đủ ${g.maxActionsPerDay} thao tác hôm nay (Giới hạn an toàn)`);
  }
  if (actionType === 'boost_creative') {
    const spent = today.filter((a) => a.actionType === 'boost_creative').reduce((s, a) => s + (a.params.boostBudget ?? 0), 0);
    if (spent + (params.boostBudget ?? 0) > g.dailyBoostCap) {
      throw new PrecheckError(`Vượt trần tăng cường hôm nay (${fmt(spent)} đã dùng / trần ${fmt(g.dailyBoostCap)})`);
    }
  }
}

/* ───────── Thực thi ───────── */

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function readback(plan: Plan, campaignId: string): Promise<string | null> {
  try {
    const info = await getCampaignInfo(campaignId);
    const n = plan.next;
    const same =
      (n.budget === undefined || info.budget === n.budget) &&
      (n.roasBid === undefined || info.roas_bid === n.roasBid) &&
      (n.itemGroupIds === undefined ||
        JSON.stringify([...(info.item_group_ids ?? [])].sort()) === JSON.stringify([...n.itemGroupIds].sort()));
    return same ? null : 'TikTok đã nhận lệnh nhưng đọc lại chưa thấy giá trị mới — kiểm tra lại sau ít phút';
  } catch {
    return 'TikTok đã nhận lệnh; chưa đọc lại được để đối chiếu';
  }
}

/** Gửi lệnh và cập nhật dòng nhật ký (đã ghi sẵn ở trạng thái running) */
async function send(plan: Plan, actionId: string, campaignId: string): Promise<ExecResult> {
  const patch = (fn: (a: AgentActionLog, rt: AgentRuntime) => void) =>
    updateRuntime((rt) => {
      const a = rt.actions.find((x) => x.id === actionId);
      if (a) fn(a, rt);
    });
  try {
    await callWriteTool(plan.tool, plan.params);
  } catch (e) {
    const rt = patch((a) => {
      a.status = 'failed';
      a.error = errText(e);
      a.note = undefined;
    });
    return { action: rt.actions.find((x) => x.id === actionId)!, message: `TikTok báo lỗi: ${errText(e)}` };
  }

  let message = plan.summary;
  if (plan.verify === 'creative') {
    // TikTok đã nhận lệnh → trả kết quả ngay (đóng hộp xác nhận); trạng thái video đọc ở nền
    const rt = patch((a) => {
      a.status = 'running';
      a.verifyAfter = nextVerifyAt(a);
      a.note = 'Chờ TikTok xác nhận';
    });
    if (executorTiming.followUp) void followUpCreative(actionId);
    message += ' — đang chờ TikTok cập nhật trạng thái, trang tự đổi khi xong';
    return { action: rt.actions.find((x) => x.id === actionId)!, message };
  }
  if (plan.verify === 'readback') {
    const warn = await readback(plan, campaignId);
    if (warn) message += ` (${warn})`;
  }
  const rt = patch((a, r) => {
    a.status = 'success';
    a.note = message === plan.summary ? undefined : message;
    if (a.undoOf) markUndone(r, a.undoOf);
  });
  return { action: rt.actions.find((x) => x.id === actionId)!, message };
}

function markUndone(rt: AgentRuntime, originalId: string) {
  const o = rt.actions.find((x) => x.id === originalId);
  if (o) o.status = 'undone';
}

/** Người làm của BOT trong nhật ký */
export const BOT_ACTOR: ActorRef = { id: 'bot', name: 'BOT AI' };

/**
 * BOT chạy (Sếp mở 25/11): thực thi lần lượt các đề xuất của quy tắc chế độ "BOT chạy" vừa tạo, đi đúng đường Duyệt
 * (xét lại số liệu, giới hạn an toàn, điều kiện TikTok). Không chạy được → đề xuất ở lại Chờ duyệt kèm lý do.
 * Quy tắc đã đổi khỏi "BOT chạy" / BOT tạm dừng giữa chừng → bỏ qua (để Sếp duyệt tay).
 */
export async function runAutoProposals(ids: string[]): Promise<{ ran: number; failed: number }> {
  let ran = 0;
  let failed = 0;
  for (const id of ids) {
    const cfg = getAgentConfig();
    const p = getRuntime().proposals.find((x) => x.id === id);
    const rule = p && cfg.rules.find((r) => r.id === p.ruleId);
    if (!AUTO_MODE_ENABLED || cfg.paused || !p || p.status !== 'pending' || rule?.mode !== 'auto') continue;
    try {
      await executeProposal(id, BOT_ACTOR, 'agent');
      ran++;
    } catch (e) {
      failed++;
      const reason = (e instanceof Error ? e.message : String(e)).replace(/^Chưa chạy được: /, '');
      updateRuntime((r) => {
        const x = r.proposals.find((y) => y.id === id);
        if (x && x.status === 'pending') x.note = `BOT chưa chạy được: ${reason} — chờ Sếp duyệt`;
      });
    }
  }
  return { ran, failed };
}

/**
 * Duyệt + thực thi 1 đề xuất. PrecheckError = không gửi lệnh, đề xuất vẫn chờ duyệt.
 * actor 'agent' = BOT tự chạy (quy tắc chế độ "BOT chạy"), còn lại = Sếp duyệt.
 */
export function executeProposal(proposalId: string, by?: ActorRef, actor: 'approved' | 'agent' = 'approved'): Promise<ExecResult> {
  return serial(async () => {
    if (!EXECUTION_ENABLED) throw new PrecheckError('Thực thi trên TikTok đang tắt');
    const rt = getRuntime();
    const p = rt.proposals.find((x) => x.id === proposalId);
    if (!p) throw new PrecheckError('Không tìm thấy đề xuất');
    // Đề xuất Sếp đã duyệt trước khi bật thực thi (chưa có actionId) → được chạy, không xét hạn 24h
    const approvedBefore = p.status === 'approved' && !p.actionId;
    if (p.status !== 'pending' && !approvedBefore) throw new PrecheckError('Đề xuất không còn chờ duyệt');
    if (!approvedBefore && Date.parse(p.expiresAt) < Date.now()) throw new PrecheckError('Đề xuất đã hết hạn');
    checkGuardrails(rt, p.actionType, p.params);

    // Số liệu mới không còn khớp quy tắc (vd ROI đã lên trên hoà vốn) → không chạy, đề xuất tự huỷ
    const cfg = getAgentConfig();
    const lookback = Math.max(1, cfg.guardrails.lookbackDays ?? 7);
    const { snapshot } = await getSnapshot({ from: vnDate(lookback), to: vnDate(1) }, false);
    // Xét lại cả khung 14 ngày (xác nhận) như lúc quét
    const check = recheckProposal(p, cfg, getSettings(), snapshot, await loadConfirmSnaps(cfg.guardrails));
    if (!check.ok) {
      updateRuntime((r) => {
        const x = r.proposals.find((y) => y.id === proposalId);
        if (x) {
          x.status = 'outdated';
          x.decidedAt = new Date().toISOString();
          x.note = check.reason;
        }
      });
      throw new PrecheckError(`Không chạy: ${check.reason}`);
    }

    let plan: Plan;
    try {
      plan = await buildPlan(p.actionType, p.target, p.params);
    } catch (e) {
      const reason = e instanceof PrecheckError ? e.message : `Không kiểm tra được điều kiện: ${errText(e)}`;
      updateRuntime((r) => {
        const x = r.proposals.find((y) => y.id === proposalId);
        if (x) x.note = `Chưa chạy được: ${reason}`;
      });
      throw new PrecheckError(reason);
    }

    const action: AgentActionLog = {
      id: crypto.randomUUID(),
      executedAt: new Date().toISOString(),
      actor,
      ruleId: p.ruleId,
      actionType: p.actionType,
      target: p.target,
      params: { ...p.params, prev: plan.prev, next: plan.next },
      before: p.before,
      after: null,
      status: 'running',
      note: 'Đang gửi lệnh lên TikTok',
      proposalId: p.id,
      ...(by ? { by } : {}),
    };
    updateRuntime((r: AgentRuntime) => {
      const x = r.proposals.find((y) => y.id === proposalId);
      if (x) {
        x.status = 'approved';
        x.decidedAt = action.executedAt;
        x.actionId = action.id;
        x.note = undefined;
        if (by) x.decidedBy = by;
      }
      r.actions.unshift(action);
      r.actions = r.actions.slice(0, 2000);
    });
    return send(plan, action.id, p.target.campaignId);
  });
}

/* ───────── Thao tác thủ công (Sếp bấm trên bảng Video + xác nhận) ───────── */

/** Thao tác thủ công cho phép từ bảng Video */
export const MANUAL_ACTIONS = ['remove_creative', 'add_creative', 'boost_creative'] as const;
export type ManualAction = (typeof MANUAL_ACTIONS)[number];
export const MAX_MANUAL_BOOST_DAYS = 7;

export interface ManualInput {
  actionType: string;
  target: AgentTarget;
  params?: AgentRuleParams;
}

/** Số liệu `lookbackDays` của video (cộng các dòng theo sản phẩm) — "Lúc quyết định" trong Nhật ký */
async function videoWindow(target: AgentTarget): Promise<AgentActionLog['before']> {
  const lookback = Math.max(1, getAgentConfig().guardrails.lookbackDays ?? 7);
  const range = { from: vnDate(lookback), to: vnDate(1) };
  const w = { from: `${range.from}T00:00:00+07:00`, to: `${range.to}T23:59:59+07:00`, cost: 0, revenue: 0, orders: 0, roi: null as number | null, breakEven: null };
  try {
    const { snapshot } = await getSnapshot(range, false);
    for (const v of snapshot.videos) {
      if (v.campaignId !== target.campaignId || v.id !== target.videoId) continue;
      w.cost += v.cost ?? 0;
      w.revenue += v.revenue ?? 0;
      w.orders += v.orders ?? 0;
    }
  } catch {
    // thiếu số liệu → để 0
  }
  w.roi = w.cost > 0 ? w.revenue / w.cost : null;
  return w;
}

/** Sếp bấm Gỡ / Thêm lại / Tăng cường trên bảng Video rồi xác nhận → chạy thật */
export function executeManual(input: ManualInput, by?: ActorRef): Promise<ExecResult> {
  return serial(async () => {
    if (!EXECUTION_ENABLED) throw new PrecheckError('Thực thi trên TikTok đang tắt');
    const actionType = input.actionType as ManualAction;
    if (!(MANUAL_ACTIONS as readonly string[]).includes(actionType)) throw new PrecheckError('Thao tác này không làm thủ công được');
    const t = input.target;
    if (!t?.campaignId || !t.productId || !t.videoId) throw new PrecheckError('Thiếu chiến dịch / sản phẩm / video');
    const target: AgentTarget = { campaignId: String(t.campaignId), productId: String(t.productId), videoId: String(t.videoId) };

    let params: AgentRuleParams = {};
    if (actionType === 'boost_creative') {
      const boostBudget = Math.round(Number(input.params?.boostBudget));
      const boostDays = Math.round(Number(input.params?.boostDays ?? 1));
      if (!Number.isFinite(boostBudget) || boostBudget < MIN_BOOST_BUDGET_VND) {
        throw new PrecheckError(`Ngân sách tăng cường tối thiểu ${fmt(MIN_BOOST_BUDGET_VND)}/ngày`);
      }
      if (!Number.isFinite(boostDays) || boostDays < 1 || boostDays > MAX_MANUAL_BOOST_DAYS) {
        throw new PrecheckError(`Số ngày tăng cường từ 1 đến ${MAX_MANUAL_BOOST_DAYS}`);
      }
      params = { boostBudget, boostDays };
    }

    checkGuardrails(getRuntime(), actionType, params);
    let plan: Plan;
    try {
      plan = await buildPlan(actionType, target, params);
    } catch (e) {
      throw e instanceof PrecheckError ? e : new PrecheckError(`Không kiểm tra được điều kiện: ${errText(e)}`);
    }

    const action: AgentActionLog = {
      id: crypto.randomUUID(),
      executedAt: new Date().toISOString(),
      actor: 'manual',
      ruleId: null,
      actionType,
      target,
      params: { ...params, prev: plan.prev, next: plan.next },
      before: await videoWindow(target),
      after: null,
      status: 'running',
      note: 'Đang gửi lệnh lên TikTok',
      ...(by ? { by } : {}),
    };
    updateRuntime((r) => {
      r.actions.unshift(action);
      r.actions = r.actions.slice(0, 2000);
    });
    return send(plan, action.id, target.campaignId);
  });
}

/** Phép ngược của từng loại thao tác */
const INVERSE: Partial<Record<AgentActionType, AgentActionType>> = {
  remove_creative: 'add_creative',
  add_creative: 'remove_creative',
  disable_product: 'enable_product',
  enable_product: 'disable_product',
  update_budget: 'update_budget',
  update_roi_target: 'update_roi_target',
};

export const canUndo = (a: Pick<AgentActionLog, 'actionType' | 'status' | 'undoOf'>) =>
  !a.undoOf && a.status === 'success' && INVERSE[a.actionType] !== undefined;

async function undoPlan(a: AgentActionLog): Promise<Plan> {
  const inverse = INVERSE[a.actionType];
  if (!inverse) {
    throw new PrecheckError(
      a.actionType === 'boost_creative'
        ? 'Tăng cường không hoàn tác được — phiên tự kết thúc khi hết số ngày đã đặt'
        : 'Thao tác này không hoàn tác được',
    );
  }
  const info = await getCampaignInfo(a.target.campaignId);
  if (info.operation_status !== 'ENABLE') throw new PrecheckError('Chiến dịch đang tắt trên TikTok');
  if (a.actionType === 'update_budget' || a.actionType === 'update_roi_target') {
    const prev = a.params.prev ?? {};
    await requireExclusive();
    if (a.actionType === 'update_budget') {
      if (!prev.budget) throw new PrecheckError('Thiếu ngân sách cũ để hoàn tác');
      return updatePlan(a.target.campaignId, { budget: prev.budget }, { budget: info.budget }, { budget: prev.budget }, `Ngân sách → ${fmt(prev.budget)}`);
    }
    if (!prev.roasBid) throw new PrecheckError('Thiếu ROI mục tiêu cũ để hoàn tác');
    return updatePlan(a.target.campaignId, { roas_bid: prev.roasBid }, { roasBid: info.roas_bid }, { roasBid: prev.roasBid }, `ROI mục tiêu → ${prev.roasBid}`);
  }
  return buildPlanWithInfo(inverse, a.target, info);
}

async function buildPlanWithInfo(actionType: AgentActionType, target: AgentTarget, info: CampaignInfo): Promise<Plan> {
  switch (actionType) {
    case 'remove_creative':
      return planCreative(info, target, 'REMOVE');
    case 'add_creative':
      return planCreative(info, target, 'ADD');
    case 'disable_product':
      return planProduct(info, target, false);
    case 'enable_product':
      return planProduct(info, target, true);
    default:
      throw new PrecheckError('Thao tác này không hoàn tác được');
  }
}

/** Hoàn tác 1 thao tác đã thành công (cũng cần Sếp xác nhận) */
export function undoAction(actionId: string, by?: ActorRef): Promise<ExecResult> {
  return serial(async () => {
    if (!EXECUTION_ENABLED) throw new PrecheckError('Thực thi trên TikTok đang tắt');
    const a = getRuntime().actions.find((x) => x.id === actionId);
    if (!a) throw new PrecheckError('Không tìm thấy thao tác');
    if (a.undoOf) throw new PrecheckError('Không hoàn tác một lần hoàn tác');
    if (a.status !== 'success') throw new PrecheckError('Chỉ hoàn tác được thao tác đã thành công');
    if (getRuntime().actions.some((x) => x.undoOf === a.id && x.status !== 'failed')) {
      throw new PrecheckError('Thao tác này đang / đã được hoàn tác');
    }
    let plan: Plan;
    try {
      plan = await undoPlan(a);
    } catch (e) {
      throw e instanceof PrecheckError ? e : new PrecheckError(`Không kiểm tra được điều kiện: ${errText(e)}`);
    }
    const inverse = INVERSE[a.actionType]!;
    const undo: AgentActionLog = {
      id: crypto.randomUUID(),
      executedAt: new Date().toISOString(),
      actor: 'manual',
      ruleId: a.ruleId,
      actionType: inverse,
      target: a.target,
      params: { prev: plan.prev, next: plan.next },
      before: a.before,
      after: null,
      status: 'running',
      note: 'Đang gửi lệnh hoàn tác lên TikTok',
      undoOf: a.id,
      ...(by ? { by } : {}),
    };
    updateRuntime((r) => {
      r.actions.unshift(undo);
      r.actions = r.actions.slice(0, 2000);
    });
    return send(plan, undo.id, a.target.campaignId);
  });
}

/* ───────── Kiểm tra kết quả gỡ / thêm video ───────── */

/** Đọc trạng thái ở nền ngay sau khi gửi lệnh (test tắt `followUp` và gọi followUpCreative trực tiếp) */
export const executorTiming = { followUp: true, inlineChecksMs: [...CREATIVE_INLINE_CHECKS_MS] };
const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

const isCreative = (a: AgentActionLog) => a.actionType === 'remove_creative' || a.actionType === 'add_creative';

/** Lần kiểm tra kế tiếp: 20 giây/lần trong 10 phút đầu, sau đó ≈ 1/4 thời gian đã trôi qua, tối đa 5 phút */
function nextVerifyAt(a: AgentActionLog, now = Date.now()): string {
  const elapsedSec = Math.max(0, (now - Date.parse(a.executedAt)) / 1000);
  const waitSec =
    elapsedSec < CREATIVE_VERIFY_FAST_MIN * 60
      ? CREATIVE_VERIFY_MIN_SEC
      : Math.min(CREATIVE_VERIFY_MAX_SEC, Math.max(CREATIVE_VERIFY_MIN_SEC, elapsedSec / 4));
  return new Date(now + waitSec * 1000).toISOString();
}

/** Ngay sau khi gửi lệnh: đọc trạng thái vài lần trong ~15 giây (chạy nền, không chặn Sếp) */
export async function followUpCreative(actionId: string): Promise<void> {
  try {
    for (const ms of executorTiming.inlineChecksMs) {
      await sleep(ms);
      if ((await checkCreative(actionId)) === 'done') return;
    }
  } catch (e) {
    console.error('[agent] đọc trạng thái video lỗi:', e instanceof Error ? e.message : e);
  }
}

/**
 * Đọc trạng thái video trên TikTok (chỉ đọc) và cập nhật dòng nhật ký đang chờ.
 * 'done' = đã thành công / lỗi; 'pending' = chưa khớp, hẹn lần kiểm tra sau.
 */
async function checkCreative(actionId: string): Promise<'done' | 'pending'> {
  const a = getRuntime().actions.find((x) => x.id === actionId);
  if (!a || a.status !== 'running' || !isCreative(a)) return 'done';
  let status: VideoStatus | null;
  try {
    status = await getVideoStatus(a.target.campaignId, a.target.productId, a.target.videoId);
  } catch {
    return 'pending'; // lỗi mạng → lần sau thử lại
  }
  const now = Date.now();
  const ok = a.actionType === 'remove_creative' ? status === 'excluded' : status !== null && status !== 'excluded';
  const timedOut = now - Date.parse(a.executedAt) > CREATIVE_VERIFY_TIMEOUT_MIN * MIN;
  updateRuntime((rt) => {
    const x = rt.actions.find((y) => y.id === actionId);
    if (!x || x.status !== 'running') return;
    if (ok) {
      x.status = 'success';
      x.note = undefined;
      x.verifyAfter = undefined;
      if (x.undoOf) markUndone(rt, x.undoOf);
    } else if (timedOut) {
      x.status = 'failed';
      x.error = `Sau ${CREATIVE_VERIFY_TIMEOUT_MIN} phút TikTok vẫn chưa ghi nhận (trạng thái video: ${status ?? 'không tìm thấy'})`;
      x.note = undefined;
      x.verifyAfter = undefined;
    } else {
      x.verifyAfter = nextVerifyAt(x, now);
    }
  });
  return ok || timedOut ? 'done' : 'pending';
}

/** Gọi định kỳ (scheduler, mỗi 30 giây): dòng đang chờ đã tới giờ → đọc trạng thái. Trả số dòng đã có kết quả. */
export async function verifyPendingActions(): Promise<number> {
  const now = Date.now();
  const due = getRuntime().actions.filter(
    (a) => a.status === 'running' && isCreative(a) && (!a.verifyAfter || Date.parse(a.verifyAfter) <= now),
  );
  let done = 0;
  for (const a of due) if ((await checkCreative(a.id)) === 'done') done++;
  return done;
}

/** Nút "Kiểm tra ngay" — chỉ đọc trạng thái, không gửi lệnh ghi */
export async function verifyAction(actionId: string): Promise<ExecResult> {
  const a = getRuntime().actions.find((x) => x.id === actionId);
  if (!a) throw new PrecheckError('Không tìm thấy thao tác');
  if (a.status !== 'running' || !isCreative(a)) throw new PrecheckError('Thao tác không còn chờ TikTok xác nhận');
  await checkCreative(actionId);
  const after = getRuntime().actions.find((x) => x.id === actionId)!;
  const message =
    after.status === 'success'
      ? 'TikTok đã ghi nhận'
      : after.status === 'failed'
        ? (after.error ?? 'Lỗi')
        : 'TikTok chưa cập nhật trạng thái — Agent sẽ tự kiểm tra lại';
  return { action: after, message };
}
