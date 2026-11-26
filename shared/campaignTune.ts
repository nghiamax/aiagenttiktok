/**
 * BOT chỉnh ROI mục tiêu & ngân sách chiến dịch — bộ quy tắc v3 (Sếp chốt 26/11/2026 sau 8 vòng phản biện).
 * Mục tiêu: tăng tổng lời/ngày, đơn không giảm. Mỗi lần đổi 1 thứ, bước nhỏ, đo lại (tối thiểu 2 / tối đa 7 ngày)
 * → giữ / lùi / không đủ cơ sở. Bảo vệ (H1–H5) phản ứng nhanh, không cần xác nhận 2 khung.
 * Lãi/lỗ chỉ so với ROI hoà vốn; ROI mục tiêu chỉ là cần gạt phân phối (không có sàn).
 * 3 chế độ Thận trọng / Cân bằng / Tăng trưởng chỉ khác bộ số (`TUNE_MODES`).
 * Hàm thuần — dùng chung web (bảng, hộp chi tiết, Tổng quan) + server (Agent).
 */
import type { AdsSnapshot, Campaign } from './adsSnapshot.js';
import type { AgentActionLog, AgentActionType } from './agentTypes.js';
import { profitPerOrderMap, type ProfitMap } from './productProfit.js';
import { breakEvenOf, type AdsSettings } from './settings.js';

/** ID "nhóm" đặc biệt của quy tắc cấp chiến dịch chạy theo Chiến lược điều chỉnh */
export const TUNE_TRIGGER = 'c-tune';

/** 3 chế độ chạy (Sếp chốt 26/11): cùng logic, chỉ khác bộ số */
export type TuneMode = 'careful' | 'balanced' | 'growth';

export interface TuneModePreset {
  /** Mỗi bước tăng ngân sách (%) */
  budgetStepPct: number;
  /** Mỗi bước hạ ROI mục tiêu (%) */
  roiDownPct: number;
  /** Lỗ thêm tối đa trong 1 bước thử (× P tham chiếu) — H5 */
  testLossP: number;
  /** Lời/ngày giảm quá (%) → trả về số cũ — D3 */
  profitDropPct: number;
}

export const TUNE_MODES: Record<TuneMode, TuneModePreset & { label: string; desc: string }> = {
  careful: { label: 'Thận trọng', desc: 'Giữ lời trước, mở rộng chậm', budgetStepPct: 10, roiDownPct: 3, testLossP: 1, profitDropPct: 3 },
  balanced: { label: 'Cân bằng', desc: 'Mở rộng từng bước khi đã xác nhận', budgetStepPct: 20, roiDownPct: 5, testLossP: 2, profitDropPct: 5 },
  growth: { label: 'Tăng trưởng', desc: 'Mở rộng nhanh hơn, chịu thử lớn hơn', budgetStepPct: 30, roiDownPct: 10, testLossP: 3, profitDropPct: 10 },
};

export interface CampaignTuneSettings {
  mode: TuneMode;
  /** Bước mở rộng: đơn/ngày giảm quá (%) → trả về số cũ (D2) */
  maxOrderDropPct: number;
  /** Đo bước thử: tối thiểu / tối đa (ngày) */
  minWaitDays: number;
  maxWaitDays: number;
  /** Tiêu hết ngân sách khi ≥ (%) */
  fullUsePct: number;
  /** Tiêu chậm khi < (%) */
  slowUsePct: number;
  /** Nâng ROI mục tiêu mỗi bước khi lỗ / lời mỏng (%) */
  roiUpPct: number;
  /** Đang lỗ + ROI MT dưới hoà vốn: nâng tối đa mỗi lần (%) */
  lossRaiseMaxPct: number;
  /** Đang lỗ + tiêu hết ngân sách: hạ ngân sách (%) */
  lossBudgetCutPct: number;
  /** Lời mỏng khi ROI thực < hoà vốn × (1 + X%) */
  thinMarginPct: number;
  /** Trần ROI mục tiêu khi nâng lúc lời mỏng = ROI thực × */
  ceilK: number;
  /** ROI thực thấp hơn ROI mục tiêu ≥ X% (tính trên ROI MT) → ngừng siết (B6) */
  gapPct: number;
  /** Ít nhất N đơn / 7 ngày mới đánh giá */
  minOrders: number;
  /** Sản phẩm thiếu ROI hoà vốn chiếm > X% doanh thu → không đánh giá */
  missingBeMaxPct: number;
  /** 1 sản phẩm chiếm ≥ X% phần lỗ → xử lý sản phẩm, không đụng chiến dịch */
  concentratePct: number;
  /** Chiến dịch mới / vừa bảo vệ: chỉ cho bảo vệ trong N ngày */
  learningDays: number;
  /** 0 đơn + chi ≥ N × P → cảnh báo (H1) / bảo vệ (H2) */
  warnP: number;
  stopP: number;
  /** Lỗ ước tính hôm nay ≥ N × P (H3) / 7 ngày ≥ N × P (H4) */
  dayLossP: number;
  weekLossP: number;
  /** Bật nhóm tình huống */
  rescue: boolean;
  grow: boolean;
  autoRevert: boolean;
}

export const DEFAULT_TUNE: CampaignTuneSettings = {
  mode: 'balanced',
  maxOrderDropPct: 10,
  minWaitDays: 2,
  maxWaitDays: 7,
  fullUsePct: 90,
  slowUsePct: 50,
  roiUpPct: 5,
  lossRaiseMaxPct: 15,
  lossBudgetCutPct: 20,
  thinMarginPct: 10,
  ceilK: 1,
  gapPct: 30,
  minOrders: 10,
  missingBeMaxPct: 20,
  concentratePct: 70,
  learningDays: 3,
  warnP: 2,
  stopP: 3,
  dayLossP: 2,
  weekLossP: 5,
  rescue: true,
  grow: true,
  autoRevert: true,
};

export type TuneConfig = CampaignTuneSettings & TuneModePreset;

/** Cấu hình đang dùng = mặc định ← bản lưu (đúng kiểu) ← bộ số của chế độ. Bản lưu cũ có waitHours / floorK… bị bỏ qua. */
export function tuneSettingsOf(settings: Pick<AdsSettings, 'campaignTune'>): TuneConfig {
  const saved = (settings.campaignTune ?? {}) as Record<string, unknown>;
  const merged = { ...DEFAULT_TUNE } as unknown as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_TUNE)) {
    const v = saved[k];
    if (v !== undefined && typeof v === typeof merged[k]) merged[k] = v;
  }
  const out = merged as unknown as CampaignTuneSettings;
  if (!TUNE_MODES[out.mode]) out.mode = 'balanced';
  const { budgetStepPct, roiDownPct, testLossP, profitDropPct } = TUNE_MODES[out.mode];
  return { ...out, budgetStepPct, roiDownPct, testLossP, profitDropPct };
}

/** Mã tình huống → tên ngắn (hiện ở badge / đề xuất) */
export const TUNE_CODES = {
  A1: 'Thiếu ROI hoà vốn',
  A2: 'Ít số liệu',
  A3: 'Đang thử',
  A5: 'Không đặt ROI mục tiêu',
  A6: 'Đang học — chỉ bảo vệ',
  F8: 'Số liệu lệch',
  H1: 'Chưa có đơn — cảnh báo',
  H2: 'Chưa có đơn — bảo vệ',
  H3: 'Lỗ hôm nay vượt giới hạn',
  H4: 'Lỗ 7 ngày vượt giới hạn',
  H5: 'Bước thử lỗ quá giới hạn',
  B1: 'Lỗ – ROI MT dưới hoà vốn',
  B2a: 'Lỗ – tiêu hết ngân sách',
  B2b: 'Lỗ – siết ROI mục tiêu',
  B3: 'Lỗ dồn vào 1 sản phẩm',
  B5: 'Vẫn lỗ sau 3 bước',
  B6: 'Lỗ – không đạt nổi ROI MT',
  B7: 'Lỗ – chờ thêm bằng chứng',
  C1: 'Lời – tiêu hết ngân sách',
  C3: 'Lời – tiêu chậm',
  C4: 'Lời mỏng',
  C9: 'Lời – giữ',
  D2: 'Lùi lại – đơn giảm',
  D3: 'Lùi lại – lãi giảm',
  D4: 'Không đủ cơ sở',
  D5: 'Đã ở điểm tốt',
  E3: 'Chiến dịch đang tắt',
  OFF: 'Chưa bật nhóm tình huống',
} as const;
export type TuneCode = keyof typeof TUNE_CODES;

/**
 * Cấp chiến dịch chỉ còn "BOT chỉnh ROI & ngân sách" (Sếp chốt 26/11): quy tắc chiến dịch theo nhóm cũ
 * (c-scale / c-low-roi / c-slow…) = kiểu cũ — server ép Tắt, Agent bỏ qua.
 */
export const isLegacyCampaignRule = (rule: { level?: string; trigger?: string | null }) => rule.level === 'campaign' && rule.trigger !== TUNE_TRIGGER;

/** Tình huống cần Sếp quyết — quy tắc c-tune chế độ Nhắc việc nhắc các mã này (+ quyết định "nên tắt") */
export const TUNE_NOTIFY_CODES = new Set<string>(['H1', 'H2', 'H4', 'B3', 'B5', 'B6']);
export const needsBossDecision = (d: Pick<TuneDecision, 'code' | 'suggestPause'>) => !!d.suggestPause || TUNE_NOTIFY_CODES.has(d.code);

/** Mã bảo vệ / lùi: không cần xác nhận 2 khung, không chờ thời gian chờ của quy tắc */
export const isProtectCode = (code: string) => code.startsWith('H') || code === 'D2' || code === 'D3';
/** Mã bảo vệ có hạ ngân sách — sau đó khoá mở rộng `learningDays` ngày */
const PROTECT_STEP_CODES = new Set(['H2', 'H3', 'B2a']);
/** Hạ ngân sách khi bảo vệ (H2 / H3) — bằng giới hạn giảm mặc định 30%/ngày */
const PROTECT_CUT_PCT = 30;

/** Nhóm hiển thị (ô Tổng quan / lọc bảng) */
export type TuneKind = 'loss' | 'grow' | 'testing' | 'hold' | 'na';

export interface ProductEcon {
  id: string;
  name: string;
  revenue: number;
  cost: number;
  breakEven: number | null;
  /** Lời gộp − chi (null khi thiếu hoà vốn) */
  profit: number | null;
}

export interface CampaignEcon {
  cost: number;
  revenue: number;
  orders: number;
  roi: number | null;
  /** Hoà vốn chiến dịch = ΣDT ÷ Σ(DT ÷ hoà vốn SP) — sản phẩm thiếu hoà vốn bỏ ra ngoài */
  breakEven: number | null;
  /** Lãi/lỗ cả khung (đ) = Σ(DT ÷ hoà vốn) − chi của các sản phẩm có hoà vốn */
  profit: number | null;
  /** % doanh thu của sản phẩm thiếu hoà vốn */
  missingShare: number;
  /** Mức tiêu ngân sách (%) — ngày hôm nay chưa hết chỉ tính phần đã qua */
  budgetUse: number | null;
  days: number;
  products: ProductEcon[];
}

const DAY = 86_400_000;
const vnDateOf = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);

/** Số ngày của khung; khung kết thúc hôm nay → ngày cuối chỉ tính phần đã qua */
export function effectiveDays(range: { from: string; to: string } | null | undefined, now = Date.now()): number {
  if (!range) return 7;
  const n = Math.round((Date.parse(range.to) - Date.parse(range.from)) / DAY) + 1;
  if (range.to !== vnDateOf(now)) return n;
  const vnMidnight = Date.parse(`${range.to}T00:00:00+07:00`);
  return Math.max(0.25, n - 1 + Math.min(1, (now - vnMidnight) / DAY));
}

export function campaignEcon(c: Campaign, snapshot: AdsSnapshot, settings: AdsSettings, now = Date.now()): CampaignEcon {
  const rows = snapshot.products.filter((p) => p.campaignId === c.id);
  let gross = 0;
  let known = 0;
  let missing = 0;
  let knownCost = 0;
  const products: ProductEcon[] = rows.map((p) => {
    const revenue = p.revenue ?? 0;
    const cost = p.cost ?? 0;
    const be = breakEvenOf(settings, p.id);
    if (be) {
      gross += revenue / be;
      known += revenue;
      knownCost += cost;
    } else missing += revenue;
    return { id: p.id, name: p.name, revenue, cost, breakEven: be, profit: be ? revenue / be - cost : null };
  });
  const cost = c.cost ?? 0;
  const revenue = c.revenue ?? 0;
  const days = effectiveDays(snapshot.range, now);
  const totalRev = known + missing;
  return {
    cost,
    revenue,
    orders: c.orders ?? 0,
    roi: cost > 0 ? revenue / cost : null,
    breakEven: gross > 0 ? known / gross : null,
    profit: known > 0 ? gross - knownCost : null,
    missingShare: totalRev > 0 ? (missing / totalRev) * 100 : 0,
    budgetUse: c.budget && c.budget > 0 ? (cost / days / c.budget) * 100 : null,
    days,
    products: products.sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0)),
  };
}

/**
 * Khung B = 7 ngày liền trước khung A (Sếp chốt vòng 6: 2 khung không chồng nhau) = 14 ngày − 7 ngày.
 * Chỉ giữ chiến dịch + sản phẩm (đủ cho quyết định chiến dịch).
 */
export function previousWindow(d14: AdsSnapshot, d7: AdsSnapshot): AdsSnapshot {
  const sub = (a: number | null, b: number | null | undefined) => Math.max(0, (a ?? 0) - (b ?? 0));
  const campaigns = d14.campaigns.map((c) => {
    const r = d7.campaigns.find((x) => x.id === c.id);
    const cost = sub(c.cost, r?.cost);
    const revenue = sub(c.revenue, r?.revenue);
    return { ...c, cost, revenue, orders: sub(c.orders, r?.orders), roi: cost > 0 ? revenue / cost : null };
  });
  const products = d14.products.map((p) => {
    const r = d7.products.find((x) => x.id === p.id && x.campaignId === p.campaignId);
    const cost = sub(p.cost, r?.cost);
    const revenue = sub(p.revenue, r?.revenue);
    return { ...p, cost, revenue, orders: sub(p.orders, r?.orders), roi: cost > 0 ? revenue / cost : null };
  });
  let range = d14.range;
  if (d14.range && d7.range) {
    const to = new Date(Date.parse(`${d7.range.from}T00:00:00Z`) - DAY).toISOString().slice(0, 10);
    range = { from: d14.range.from, to };
  }
  return { ...d14, campaigns, products, videos: [], range };
}

/**
 * P tham chiếu của chiến dịch (Sếp chốt vòng 4–5): lợi nhuận 1 đơn trung bình theo cơ cấu đơn thật của chính chiến dịch
 * (30 → 14 → 7 ngày); chưa có đơn → P nhỏ nhất (> 0) trong các sản phẩm của chiến dịch; không có → null (chưa đủ tin cậy).
 */
export function campaignPRef(campaignId: string, snaps: (AdsSnapshot | null | undefined)[], profit: ProfitMap): number | null {
  const list = snaps.filter((s): s is AdsSnapshot => !!s);
  for (const s of list) {
    let w = 0;
    let n = 0;
    for (const p of s.products) {
      if (p.campaignId !== campaignId) continue;
      const P = profit.get(p.id);
      const o = p.orders ?? 0;
      if (P != null && P > 0 && o > 0) {
        w += P * o;
        n += o;
      }
    }
    if (n > 0) return w / n;
  }
  let min: number | null = null;
  for (const s of list) {
    for (const p of s.products) {
      if (p.campaignId !== campaignId) continue;
      const P = profit.get(p.id);
      if (P != null && P > 0 && (min == null || P < min)) min = P;
    }
  }
  return min;
}

export interface TuneAction {
  type: Extract<AgentActionType, 'update_budget' | 'update_roi_target'>;
  /** % đổi (dương = tăng) */
  pct: number;
  from: number;
  to: number;
  /** Lùi lại thao tác này (ID nhật ký) */
  revertOf?: string;
}

export interface TuneDecision {
  campaignId: string;
  code: TuneCode;
  kind: TuneKind;
  /** Câu giải thích ngắn */
  reason: string;
  action?: TuneAction;
  /** Nên tắt chiến dịch (H2 tiêu ít / H4) — BOT chưa có lệnh tắt, Sếp tắt tay trên TikTok */
  suggestPause?: boolean;
  /** Bước thử thứ mấy liên tiếp (tính cả bước này) */
  step?: number;
  /** Lúc đo lại / được đổi tiếp (ISO) */
  waitUntil?: string;
  /** Lợi nhuận 1 đơn tham chiếu (đ), null = chưa đủ tin cậy */
  pRef?: number | null;
  econ: CampaignEcon;
}

const TUNE_TYPES = new Set<AgentActionType>(['update_budget', 'update_roi_target']);
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => n.toFixed(n >= 10 ? 0 : 1).replace('.', ',');
const vnd = (n: number) => `${Math.round(n / 1000).toLocaleString('vi-VN')}k`;
const money = (n: number) => `${n < 0 ? '−' : '+'}${Math.abs(n) >= 1e6 ? `${(Math.abs(n) / 1e6).toFixed(2).replace('.', ',')}tr` : vnd(Math.abs(n))}`;
const iso = (ms: number) => new Date(ms).toISOString();

/** Thao tác đổi ROI / ngân sách đã chạy trên chiến dịch (mới nhất trước) */
export function tuneHistory(actions: AgentActionLog[], campaignId: string): AgentActionLog[] {
  return actions
    .filter((a) => a.target.campaignId === campaignId && TUNE_TYPES.has(a.actionType) && (a.status === 'success' || a.status === 'undone'))
    .sort((a, b) => b.executedAt.localeCompare(a.executedAt));
}

/** Lùi về số cũ: cần prev / next đã ghi lúc chạy */
function revertOf(a: AgentActionLog): TuneAction | null {
  const prev = a.actionType === 'update_budget' ? a.params.prev?.budget : a.params.prev?.roasBid;
  const next = a.actionType === 'update_budget' ? a.params.next?.budget : a.params.next?.roasBid;
  if (!prev || !next || prev === next) return null;
  return { type: a.actionType as TuneAction['type'], pct: Math.round((prev / next - 1) * 1000) / 10, from: next, to: prev, revertOf: a.id };
}

/** Bước siết (hạ ngân sách / nâng ROI mục tiêu): đơn giảm là dự kiến → không áp D2 */
function isTightenStep(a: AgentActionLog): boolean {
  if (a.actionType === 'update_budget') return (a.params.next?.budget ?? 0) < (a.params.prev?.budget ?? 0);
  return (a.params.next?.roasBid ?? 0) > (a.params.prev?.roasBid ?? 0);
}

/** Lời/ngày trước bước thử + từng ngày sau (theo hoà vốn ghi lúc quyết định) */
function stepProfit(a: AgentActionLog, breakEven: number | null, maxDays: number) {
  const days = (a.after?.days ?? []).slice(0, maxDays);
  const bDays = Math.max(1, Math.round((Date.parse(a.before.to) - Date.parse(a.before.from)) / DAY));
  const be = a.before.breakEven ?? breakEven;
  const pd = (rev: number, cost: number) => (be ? rev / be - cost : null);
  return {
    days,
    bDays,
    bOrders: (a.before.orders ?? 0) / bDays,
    bProfit: pd((a.before.revenue ?? 0) / bDays, (a.before.cost ?? 0) / bDays),
    dayProfit: days.map((d) => pd(d.revenue, d.cost)),
  };
}

/**
 * Đánh giá 1 bước thử (Sếp chốt vòng 3 + 6): chờ tối thiểu `minWaitDays` ngày; đủ đơn thì chấm, hết `maxWaitDays`
 * vẫn thiếu → D4 "không đủ cơ sở" (giữ số mới). D3 = lời/ngày giảm quá % của chế độ; D2 = đơn giảm — chỉ bước mở rộng.
 * null = chưa đủ ngày để chấm.
 */
export function judgeStep(
  a: AgentActionLog,
  s: TuneConfig,
  breakEven: number | null,
): { keep: boolean; code?: 'D2' | 'D3' | 'D4'; text: string } | null {
  const { days, bOrders, bProfit, dayProfit } = stepProfit(a, breakEven, s.maxWaitDays);
  if (days.length < s.minWaitDays) return null;
  const aOrdersTotal = days.reduce((x, d) => x + d.orders, 0);
  const aOrders = aOrdersTotal / days.length;
  const aProfit = dayProfit.every((p) => p != null) ? dayProfit.reduce<number>((x, p) => x + (p ?? 0), 0) / days.length : null;
  const text = `${days.length} ngày: đơn/ngày ${fmt(bOrders)} → ${fmt(aOrders)}${bProfit != null && aProfit != null ? ` · lãi/ngày ${money(bProfit)} → ${money(aProfit)}` : ''}`;
  const tighten = isTightenStep(a);
  const enough = aOrdersTotal >= Math.ceil((s.minOrders * days.length) / 7) || (tighten && bProfit != null);
  if (!enough) return days.length >= s.maxWaitDays ? { keep: true, code: 'D4', text } : null;
  const dropPct = bOrders > 0 ? ((bOrders - aOrders) / bOrders) * 100 : 0;
  if (!tighten && dropPct > s.maxOrderDropPct) return { keep: false, code: 'D2', text };
  if (bProfit != null && aProfit != null && aProfit < bProfit - Math.abs(bProfit) * (s.profitDropPct / 100)) return { keep: false, code: 'D3', text };
  return { keep: true, text };
}

/** Lời mất thêm (đ) từ lúc thử = Σ (lời/ngày trước − lời từng ngày sau) — H5 */
export function stepExtraLoss(a: AgentActionLog, breakEven: number | null, maxDays: number): { extra: number; days: number } | null {
  const { days, bProfit, dayProfit } = stepProfit(a, breakEven, maxDays);
  if (!days.length || bProfit == null || dayProfit.some((p) => p == null)) return null;
  return { extra: dayProfit.reduce<number>((x, p) => x + (bProfit - (p ?? 0)), 0), days: days.length };
}

/** ROI mục tiêu mới, làm tròn 1 chữ số như TikTok, luôn khác số cũ ít nhất 0,1 theo hướng đổi */
function roiTo(current: number, pct: number): number {
  let to = round1(current * (1 + pct / 100));
  if (to === round1(current)) to = round1(current + (pct > 0 ? 0.1 : -0.1));
  return Math.max(0.1, to);
}

const roiAction = (from: number, to: number): TuneAction => ({ type: 'update_roi_target', pct: Math.round((to / from - 1) * 1000) / 10, from, to });
const budgetAction = (from: number, to: number): TuneAction => ({ type: 'update_budget', pct: Math.round((to / from - 1) * 1000) / 10, from, to });
const budgetBy = (from: number, pct: number) => budgetAction(from, Math.round((from * (1 + pct / 100)) / 1000) * 1000);

export interface TuneContext {
  /** P tham chiếu chiến dịch (đ/đơn); null / thiếu = chưa đủ tin cậy → H1/H2 chỉ cảnh báo */
  pRef?: number | null;
  /** Số liệu hôm nay (H3) */
  today?: AdsSnapshot | null;
  /** Chiến dịch mới: 7 ngày trước đó chưa có chi */
  isNew?: boolean;
}

/**
 * Quyết định cho 1 chiến dịch theo số liệu `snapshot` (khung A — 7 ngày) + lịch sử thao tác.
 * Không có `action` = không đổi gì (chỉ báo tình trạng). Thứ tự: kiểm tra → bảo vệ → đo bước thử → lỗ → lời mỏng → mở rộng.
 */
export function decideCampaign(
  c: Campaign,
  snapshot: AdsSnapshot,
  settings: AdsSettings,
  actions: AgentActionLog[],
  now = Date.now(),
  ctx: TuneContext = {},
): TuneDecision {
  const s = tuneSettingsOf(settings);
  const econ = campaignEcon(c, snapshot, settings, now);
  const pRef = ctx.pRef ?? null;
  const base = { campaignId: c.id, econ, pRef };
  const out = (code: TuneCode, kind: TuneKind, reason: string, extra: Partial<TuneDecision> = {}): TuneDecision => ({ ...base, code, kind, reason, ...extra });

  // ── P0 kiểm tra
  if (c.status !== 'running') return out('E3', 'na', 'Chiến dịch đang tắt — không chỉnh');
  const prodCost = econ.products.reduce((x, p) => x + p.cost, 0);
  if (econ.cost > 0 && Math.abs(prodCost - econ.cost) > econ.cost * 0.2) {
    return out('F8', 'na', `Chi theo sản phẩm (${vnd(prodCost)}) lệch chi chiến dịch (${vnd(econ.cost)}) — chưa chỉnh`);
  }

  // Lịch sử: bước gần nhất + chuỗi bước liên tiếp
  const hist = tuneHistory(actions, c.id);
  const last = hist[0];
  const streak = (() => {
    let n = 0;
    for (const a of hist) {
      if (a.params.tune?.revertOf || a.undoOf) break;
      n++;
    }
    return n;
  })();
  const sinceLast = last ? now - Date.parse(last.executedAt) : Infinity;
  const lastReverted = !!last && !!(last.params.tune?.revertOf || last.undoOf);
  const use = econ.budgetUse;
  const recentProtect = hist.find((a) => a.status === 'success' && PROTECT_STEP_CODES.has(a.params.tune?.code ?? '') && now - Date.parse(a.executedAt) < s.learningDays * DAY);
  const protectedToday = hist.some((a) => a.status === 'success' && PROTECT_STEP_CODES.has(a.params.tune?.code ?? '') && now - Date.parse(a.executedAt) < DAY);

  // ── Đo bước vừa thử: H5 (lỗ thêm quá giới hạn) → lùi ngay; D2 / D3 → lùi; còn lại nhớ để giữ sau phần bảo vệ
  let waitHold: TuneDecision | null = null;
  if (last && !lastReverted && last.status === 'success') {
    const ex = pRef ? stepExtraLoss(last, econ.breakEven, s.maxWaitDays) : null;
    const back = revertOf(last);
    if (ex && pRef && back && ex.extra >= s.testLossP * pRef) {
      return out('H5', 'loss', `Bước thử làm mất thêm ${vnd(ex.extra)} sau ${ex.days} ngày (giới hạn ${s.testLossP}P = ${vnd(s.testLossP * pRef)}) → trả về số cũ ngay`, { action: back });
    }
    const j = s.autoRevert ? judgeStep(last, s, econ.breakEven) : null;
    if (j && !j.keep && back) return out(j.code!, 'testing', `Bước thử vừa rồi làm ${j.code === 'D2' ? 'đơn giảm' : 'lãi giảm'}: ${j.text} → trả về số cũ`, { action: back });
    if (s.autoRevert && !j && sinceLast < s.maxWaitDays * DAY) {
      waitHold = out('A3', 'testing', `Đang thử bước ${Math.max(1, streak)} — đo lại sau ${s.minWaitDays} ngày`, {
        step: Math.max(1, streak),
        waitUntil: iso(Date.parse(last.executedAt) + s.minWaitDays * DAY),
      });
    } else if (j?.code === 'D4' && sinceLast < (s.maxWaitDays + 7) * DAY) {
      waitHold = out('D4', 'hold', `Thử ${j.text} — chưa đủ số để kết luận, giữ số mới, tạm không thử tiếp`, {
        waitUntil: iso(Date.parse(last.executedAt) + (s.maxWaitDays + 7) * DAY),
      });
    } else if (!s.autoRevert && sinceLast < s.minWaitDays * DAY) {
      waitHold = out('A3', 'testing', `Đang thử bước ${Math.max(1, streak)}`, { step: Math.max(1, streak), waitUntil: iso(Date.parse(last.executedAt) + s.minWaitDays * DAY) });
    }
  } else if (last && lastReverted && sinceLast < s.minWaitDays * DAY) {
    waitHold = out('A3', 'testing', 'Vừa lùi về số cũ — chờ ổn định rồi mới đổi tiếp', { waitUntil: iso(Date.parse(last.executedAt) + s.minWaitDays * DAY) });
  }

  // ── P1 bảo vệ: chưa có đơn (H1 / H2)
  if (econ.orders === 0 && econ.cost > 0) {
    if (!pRef) return out('A2', 'na', `Chưa có đơn, đã chi ${vnd(econ.cost)} — chưa có lợi nhuận 1 đơn tham chiếu để so, chỉ theo dõi`);
    const pText = `${fmt(econ.cost / pRef)}P (P = ${vnd(pRef)})`;
    if (econ.cost >= s.stopP * pRef) {
      if (ctx.isNew) return out('H2', 'loss', `Chưa có đơn, đã chi ${pText} — chiến dịch đang học: Sếp xem lại / tắt tay nếu cần`, { suggestPause: true });
      if (use != null && use >= s.fullUsePct && c.budget && !protectedToday) {
        return out('H2', 'loss', `Chưa có đơn, đã chi ${pText}, tiêu ${Math.round(use)}% ngân sách → hạ ngân sách ${PROTECT_CUT_PCT}%`, { action: budgetBy(c.budget, -PROTECT_CUT_PCT) });
      }
      return out('H2', 'loss', `Chưa có đơn, đã chi ${pText}${use != null ? `, chỉ tiêu ${Math.round(use)}% ngân sách (hạ ngân sách không tác dụng)` : ''} → nên tắt chiến dịch (tắt tay trên TikTok)`, { suggestPause: true });
    }
    if (econ.cost >= s.warnP * pRef) return out('H1', 'loss', `Chưa có đơn, đã chi ${pText} — cảnh báo, chưa chỉnh`);
    return waitHold ?? out('A2', 'na', `Chưa có đơn, đã chi ${pText} — chưa tới ngưỡng cảnh báo ${s.warnP}P`);
  }

  if (econ.missingShare > s.missingBeMaxPct) return out('A1', 'na', `${Math.round(econ.missingShare)}% doanh thu là sản phẩm chưa nhập ROI hoà vốn — chưa đánh giá được`);

  // ── H3: lỗ ước tính hôm nay vượt giới hạn → hạ ngân sách về gần mức đã chi (tối đa 30%)
  const todayC = ctx.today?.campaigns.find((x) => x.id === c.id);
  if (pRef && todayC && ctx.today && c.budget && !protectedToday) {
    const t = campaignEcon({ ...todayC, budget: c.budget }, ctx.today, settings, now);
    if (t.profit != null && -t.profit >= s.dayLossP * pRef) {
      const to = Math.max(Math.ceil(t.cost / 1000) * 1000, Math.round((c.budget * (1 - PROTECT_CUT_PCT / 100)) / 1000) * 1000);
      if (to < c.budget) {
        return out('H3', 'loss', `Hôm nay lỗ ước tính ${vnd(-t.profit)} (giới hạn ${s.dayLossP}P = ${vnd(s.dayLossP * pRef)}) → hạ ngân sách về gần mức đã chi`, { action: budgetAction(c.budget, to) });
      }
    }
  }

  // ── H4: lỗ 7 ngày vượt giới hạn → nên tắt (Sếp tắt tay); vẫn xét bước cứu lỗ bên dưới
  const weekOver = pRef != null && econ.profit != null && -econ.profit >= s.weekLossP * pRef;
  const h4 = (d: TuneDecision): TuneDecision =>
    weekOver
      ? { ...d, code: 'H4', kind: 'loss', suggestPause: true, reason: `Lỗ 7 ngày ${vnd(-econ.profit!)} vượt ${s.weekLossP}P (${vnd(s.weekLossP * pRef!)}) → nên tắt chiến dịch (tắt tay trên TikTok). ${d.action ? `Trong lúc chờ: ${d.reason}` : d.reason}` }
      : d;

  if (econ.orders < s.minOrders) return h4(out('A2', 'na', `Mới ${econ.orders} đơn trong khung — cần ít nhất ${s.minOrders} đơn`));
  if (waitHold) return h4(waitHold);
  if (ctx.isNew) return h4(out('A6', (econ.profit ?? 0) < 0 ? 'loss' : 'hold', `Chiến dịch mới (7 ngày trước chưa chạy) — chỉ bảo vệ, chưa chỉnh ROI / ngân sách`));

  const mt = c.targetRoi;
  const be = econ.breakEven!;
  const roi = econ.roi ?? 0;

  // ── P3 đang lỗ
  if (econ.profit != null && econ.profit < 0) {
    if (!s.rescue) return h4(out('OFF', 'loss', 'Đang lỗ — nhóm "Cứu chiến dịch lỗ" đang tắt'));
    const losses = econ.products.filter((p) => (p.profit ?? 0) < 0);
    const totalLoss = losses.reduce((x, p) => x + (p.profit ?? 0), 0);
    const worst = [...losses].sort((a, b) => (a.profit ?? 0) - (b.profit ?? 0))[0];
    if (econ.products.length > 1 && worst && totalLoss < 0 && ((worst.profit ?? 0) / totalLoss) * 100 >= s.concentratePct) {
      return h4(out('B3', 'loss', `Lỗ chủ yếu ở "${worst.name}" (${money(worst.profit ?? 0)}) — xử lý sản phẩm này trước, không đụng cả chiến dịch`));
    }
    const raisesSince = hist.filter((a) => a.actionType === 'update_roi_target' && (a.params.next?.roasBid ?? 0) > (a.params.prev?.roasBid ?? Infinity) && now - Date.parse(a.executedAt) < 21 * DAY);
    if (raisesSince.length >= 3) return h4(out('B5', 'loss', `Đã nâng ROI mục tiêu ${raisesSince.length} lần mà vẫn lỗ — Sếp xem lại giá bán / sản phẩm / có nên tắt chiến dịch`));
    if (mt != null && mt < be) {
      const to = roiTo(mt, Math.min(s.lossRaiseMaxPct, (be / mt - 1) * 100));
      return h4(out('B1', 'loss', `ROI thực ${fmt(roi)} < hoà vốn ${fmt(be)}; ROI mục tiêu ${fmt(mt)} đặt dưới hoà vốn → nâng dần`, { action: roiAction(mt, to), step: streak + 1 }));
    }
    if (use != null && use >= s.fullUsePct && c.budget) {
      return h4(out('B2a', 'loss', `ROI thực ${fmt(roi)} < hoà vốn ${fmt(be)}, tiêu ${Math.round(use)}% ngân sách → hạ ngân sách ${s.lossBudgetCutPct}%`, {
        action: budgetBy(c.budget, -s.lossBudgetCutPct),
        step: streak + 1,
      }));
    }
    if (mt == null) return h4(out('A5', 'loss', 'Đang lỗ nhưng chiến dịch không đặt ROI mục tiêu'));
    const gap = ((mt - roi) / mt) * 100;
    if (gap >= s.gapPct) {
      return h4(out('B6', 'loss', `ROI thực ${fmt(roi)} thấp hơn ROI mục tiêu ${fmt(mt)} tới ${Math.round(gap)}% — nâng thêm không giúp được, giữ và báo Sếp`));
    }
    return h4(out('B2b', 'loss', `ROI thực ${fmt(roi)} < hoà vốn ${fmt(be)}, tiêu ${use != null ? Math.round(use) : '--'}% ngân sách → nâng ROI mục tiêu ${s.roiUpPct}%`, {
      action: roiAction(mt, roiTo(mt, s.roiUpPct)),
      step: streak + 1,
    }));
  }

  // ── Đang lời
  const reverts = hist.filter((a) => (a.params.tune?.revertOf || a.undoOf) && now - Date.parse(a.executedAt) < 14 * DAY);
  const recentRevert = reverts[0];
  if (recentRevert && reverts.length >= 2) return out('D5', 'hold', 'Đã lùi 2 lần gần đây — chiến dịch đang ở điểm tốt, tạm không thử');
  if (!s.grow) return out('OFF', 'hold', 'Đang lời — nhóm "Mở rộng chiến dịch lời" đang tắt');
  const profitText = econ.profit != null ? `lời ${money(econ.profit / Math.max(1, econ.days))}/ngày` : 'đang lời';

  // P4 lời mỏng: chỉ nâng ROI MT khi tiêu đủ ngân sách (tiêu ít mà nâng thì mất lời)
  if (roi < be * (1 + s.thinMarginPct / 100)) {
    const to = mt != null ? roiTo(mt, s.roiUpPct) : null;
    if (mt != null && to != null && use != null && use >= s.slowUsePct && to <= roi * s.ceilK) {
      return out('C4', 'grow', `Lời mỏng (ROI ${fmt(roi)} sát hoà vốn ${fmt(be)}), tiêu ${Math.round(use)}% ngân sách → nâng nhẹ ROI mục tiêu`, { action: roiAction(mt, to), step: streak + 1 });
    }
    return out('C4', 'hold', `Lời mỏng (ROI ${fmt(roi)} sát hoà vốn ${fmt(be)}) — giữ, không mở rộng`);
  }

  // Vừa bảo vệ → khoá mở rộng
  if (recentProtect) {
    return out('A6', 'hold', `Vừa bảo vệ lúc ${vnDateOf(Date.parse(recentProtect.executedAt))} — khoá mở rộng ${s.learningDays} ngày`, {
      waitUntil: iso(Date.parse(recentProtect.executedAt) + s.learningDays * DAY),
    });
  }

  // P5 / P6 mở rộng
  if (use != null && use >= s.fullUsePct && c.budget) {
    return out('C1', 'grow', `${profitText}, tiêu ${Math.round(use)}% ngân sách — TikTok còn tìm được đơn mà hết tiền → tăng ngân sách ${s.budgetStepPct}%`, {
      action: budgetBy(c.budget, s.budgetStepPct),
      step: streak + 1,
    });
  }
  if (mt == null) return out('A5', 'hold', 'Chiến dịch không đặt ROI mục tiêu — chỉ chỉnh được ngân sách');
  // Vừa lùi bước nâng ROI → lần này đổi hướng (hạ nhẹ để lấy thêm đơn)
  const lastRevertWasRaise = recentRevert ? (recentRevert.params.next?.roasBid ?? 0) < (recentRevert.params.prev?.roasBid ?? 0) : false;
  if ((use != null && use < s.slowUsePct) || lastRevertWasRaise) {
    return out('C3', 'grow', `${profitText}, ${use != null && use < s.slowUsePct ? `chỉ tiêu ${Math.round(use)}% ngân sách` : 'vừa lùi bước nâng ROI'} → hạ ROI mục tiêu ${s.roiDownPct}% để lấy thêm đơn`, {
      action: roiAction(mt, roiTo(mt, -s.roiDownPct)),
      step: streak + 1,
    });
  }
  return out('C9', 'hold', `${profitText}, tiêu ${use != null ? Math.round(use) : '--'}% ngân sách — giữ`);
}

/** Họ quyết định để xác nhận 2 khung: lỗ = cả 2 khung đều lỗ; mở rộng = cùng hướng hành động */
const familyOf = (d: TuneDecision) => (d.kind === 'loss' ? 'loss' : d.action ? `${d.action.type}:${Math.sign(d.action.pct)}` : null);

export interface TuneExtraSnaps {
  /** 30 ngày — cơ cấu đơn để tính P tham chiếu */
  d30?: AdsSnapshot | null;
  /** Hôm nay — H3 */
  d1?: AdsSnapshot | null;
}

/**
 * Quyết định cho mọi chiến dịch. Khung A = 7 ngày (`d7`) quyết định; khung B = 7 ngày liền trước (`d14` − `d7`) xác nhận:
 * bước cứu lỗ cần cả B cũng lỗ (khác → B7), bước mở rộng cần B cùng hướng (khác → dấu hiệu). Bảo vệ / lùi không cần xác nhận.
 */
export function tuneDecisions(
  d7: AdsSnapshot,
  d14: AdsSnapshot | null,
  settings: AdsSettings,
  actions: AgentActionLog[],
  now = Date.now(),
  extra: TuneExtraSnaps = {},
): Map<string, TuneDecision & { signal?: boolean }> {
  const out = new Map<string, TuneDecision & { signal?: boolean }>();
  const prev = d14 ? previousWindow(d14, d7) : null;
  const profit = profitPerOrderMap({ d7, d14, d30: extra.d30 ?? null }, settings);
  for (const c of d7.campaigns) {
    const pRef = campaignPRef(c.id, [extra.d30, d14, d7], profit);
    const cPrev = prev?.campaigns.find((x) => x.id === c.id);
    const isNew = !!prev && (!cPrev || (cPrev.cost ?? 0) <= 0);
    const d = decideCampaign(c, d7, settings, actions, now, { pRef, today: extra.d1, isNew });
    if (d.action && !isProtectCode(d.code) && !d.action.revertOf && prev && cPrev) {
      const d2 = decideCampaign({ ...cPrev, budget: c.budget, targetRoi: c.targetRoi, status: c.status }, prev, settings, [], now, { pRef });
      if (familyOf(d2) !== familyOf(d)) {
        out.set(
          c.id,
          d.kind === 'loss'
            ? { ...d, code: 'B7', action: undefined, signal: true, reason: `${d.reason} — 7 ngày trước đó chưa lỗ / chưa đủ số, chờ thêm bằng chứng` }
            : { ...d, action: undefined, kind: 'hold', signal: true, reason: `${d.reason} — 7 ngày trước đó chưa cùng hướng, chờ thêm` },
        );
        continue;
      }
    }
    out.set(c.id, d);
  }
  return out;
}

export const tuneActionText = (a: TuneAction) =>
  a.type === 'update_budget'
    ? `${a.revertOf ? 'Trả' : a.pct > 0 ? 'Tăng' : 'Giảm'} ngân sách ${vnd(a.from)} → ${vnd(a.to)}`
    : `${a.revertOf ? 'Trả' : a.pct > 0 ? 'Tăng' : 'Hạ'} ROI mục tiêu ${fmt(a.from)} → ${fmt(a.to)}`;
