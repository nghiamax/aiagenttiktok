/**
 * BOT chỉnh ROI mục tiêu & ngân sách chiến dịch (Sếp chốt 26/11/2026).
 * Mục tiêu chung: tăng tổng lời, số đơn không giảm. Mỗi lần đổi 1 thứ, bước nhỏ, đo lại sau `waitHours`
 * (so N ngày sau với trung bình/ngày lúc quyết định) → giữ / lùi / đổi hướng.
 * Tình huống (mã A–E) xem `TUNE_CODES`. Hàm thuần — dùng chung web (bảng, hộp chi tiết, Tổng quan) + server (Agent).
 */
import type { AdsSnapshot, Campaign } from './adsSnapshot.js';
import type { AgentActionLog, AgentActionType } from './agentTypes.js';
import { breakEvenOf, type AdsSettings } from './settings.js';

/** ID "nhóm" đặc biệt của quy tắc cấp chiến dịch chạy theo Chiến lược điều chỉnh */
export const TUNE_TRIGGER = 'c-tune';

export interface CampaignTuneSettings {
  /** Đơn/ngày được giảm tối đa sau 1 bước thử (%) */
  maxOrderDropPct: number;
  /** Chờ giữa 2 lần đổi cùng chiến dịch (giờ) — cũng là thời gian đo */
  waitHours: number;
  /** Tiêu hết ngân sách khi ≥ (%) */
  fullUsePct: number;
  /** Tiêu chậm khi < (%) */
  slowUsePct: number;
  /** Mỗi bước tăng ngân sách (%) */
  budgetStepPct: number;
  /** Mỗi bước đổi ROI mục tiêu (%) */
  roiStepPct: number;
  /** Đang lỗ: nâng ROI mục tiêu tối đa mỗi lần (%) */
  lossRaiseMaxPct: number;
  /** Sàn ROI mục tiêu = hoà vốn chiến dịch × */
  floorK: number;
  /** Trần ROI mục tiêu = ROI thực 7 ngày × */
  ceilK: number;
  /** Ít nhất N đơn trong khung mới đánh giá */
  minOrders: number;
  /** Sản phẩm thiếu ROI hoà vốn chiếm > X% doanh thu → không đánh giá */
  missingBeMaxPct: number;
  /** 1 sản phẩm chiếm ≥ X% phần lỗ → xử lý sản phẩm, không đụng chiến dịch */
  concentratePct: number;
  /** Bật nhóm tình huống */
  rescue: boolean;
  grow: boolean;
  autoRevert: boolean;
}

export const DEFAULT_TUNE: CampaignTuneSettings = {
  maxOrderDropPct: 10,
  waitHours: 72,
  fullUsePct: 90,
  slowUsePct: 50,
  budgetStepPct: 20,
  roiStepPct: 5,
  lossRaiseMaxPct: 15,
  floorK: 1.1,
  ceilK: 1,
  minOrders: 10,
  missingBeMaxPct: 20,
  concentratePct: 70,
  rescue: true,
  grow: true,
  autoRevert: true,
};

export const tuneSettingsOf = (settings: Pick<AdsSettings, 'campaignTune'>): CampaignTuneSettings => ({
  ...DEFAULT_TUNE,
  ...settings.campaignTune,
});

/** Mã tình huống → tên ngắn (hiện ở badge / đề xuất) */
export const TUNE_CODES = {
  A1: 'Thiếu ROI hoà vốn',
  A2: 'Ít số liệu',
  A3: 'Đang thử',
  A5: 'Không đặt ROI mục tiêu',
  B1: 'Lỗ – ROI MT đặt thấp',
  B2: 'Lỗ – chạy không đạt ROI MT',
  B3: 'Lỗ dồn vào 1 sản phẩm',
  B5: 'Vẫn lỗ sau 3 bước',
  C1: 'Lời – tiêu hết ngân sách',
  C2: 'Lời – tiêu vừa',
  C3: 'Lời – tiêu chậm',
  C4: 'Lời mỏng',
  C9: 'Lời – đang ở điểm tốt',
  D2: 'Lùi lại – đơn giảm',
  D3: 'Lùi lại – lãi giảm',
  D5: 'Đã ở điểm tốt',
  E3: 'Chiến dịch đang tắt',
  OFF: 'Chưa bật nhóm tình huống',
} as const;
export type TuneCode = keyof typeof TUNE_CODES;

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
  /** Bước thử thứ mấy liên tiếp (tính cả bước này) */
  step?: number;
  /** Lúc đo lại / được đổi tiếp (ISO) */
  waitUntil?: string;
  econ: CampaignEcon;
}

const TUNE_TYPES = new Set<AgentActionType>(['update_budget', 'update_roi_target']);
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => n.toFixed(n >= 10 ? 0 : 1).replace('.', ',');
const vnd = (n: number) => `${Math.round(n / 1000).toLocaleString('vi-VN')}k`;
const money = (n: number) => `${n < 0 ? '−' : '+'}${Math.abs(n) >= 1e6 ? `${(Math.abs(n) / 1e6).toFixed(2).replace('.', ',')}tr` : vnd(Math.abs(n))}`;

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

/** Đánh giá 1 bước thử sau khi đủ ngày đo */
export function judgeStep(a: AgentActionLog, s: CampaignTuneSettings, breakEven: number | null): { keep: boolean; code?: 'D2' | 'D3'; text: string } | null {
  const need = Math.max(1, Math.round(s.waitHours / 24));
  const days = (a.after?.days ?? []).slice(0, need);
  if (days.length < need) return null;
  const bDays = Math.max(1, Math.round((Date.parse(a.before.to) - Date.parse(a.before.from)) / DAY));
  const be = a.before.breakEven ?? breakEven;
  const bOrders = (a.before.orders ?? 0) / bDays;
  const aOrders = days.reduce((x, d) => x + d.orders, 0) / days.length;
  const profitPerDay = (rev: number, cost: number) => (be ? rev / be - cost : null);
  const bProfit = profitPerDay((a.before.revenue ?? 0) / bDays, (a.before.cost ?? 0) / bDays);
  const aProfit = profitPerDay(days.reduce((x, d) => x + d.revenue, 0) / days.length, days.reduce((x, d) => x + d.cost, 0) / days.length);
  const dropPct = bOrders > 0 ? ((bOrders - aOrders) / bOrders) * 100 : 0;
  const text = `đơn/ngày ${fmt(bOrders)} → ${fmt(aOrders)}${bProfit != null && aProfit != null ? ` · lãi/ngày ${money(bProfit)} → ${money(aProfit)}` : ''}`;
  if (dropPct > s.maxOrderDropPct) return { keep: false, code: 'D2', text };
  // Lãi giảm quá 5% (chênh nhỏ coi như giữ nguyên)
  if (bProfit != null && aProfit != null && aProfit < bProfit - Math.abs(bProfit) * 0.05) return { keep: false, code: 'D3', text };
  return { keep: true, text };
}

/** ROI mục tiêu mới, làm tròn 1 chữ số như TikTok, luôn khác số cũ ít nhất 0,1 theo hướng đổi */
function roiTo(current: number, pct: number): number {
  let to = round1(current * (1 + pct / 100));
  if (to === round1(current)) to = round1(current + (pct > 0 ? 0.1 : -0.1));
  return Math.max(0.1, to);
}

const roiAction = (from: number, to: number): TuneAction => ({ type: 'update_roi_target', pct: Math.round((to / from - 1) * 1000) / 10, from, to });

/**
 * Quyết định cho 1 chiến dịch theo số liệu `snapshot` (thường 7 ngày) + lịch sử thao tác.
 * Không có `action` = không đổi gì (chỉ báo tình trạng).
 */
export function decideCampaign(
  c: Campaign,
  snapshot: AdsSnapshot,
  settings: AdsSettings,
  actions: AgentActionLog[],
  now = Date.now(),
): TuneDecision {
  const s = tuneSettingsOf(settings);
  const econ = campaignEcon(c, snapshot, settings, now);
  const base = { campaignId: c.id, econ };
  const out = (code: TuneCode, kind: TuneKind, reason: string, extra: Partial<TuneDecision> = {}): TuneDecision => ({ ...base, code, kind, reason, ...extra });

  if (c.status !== 'running') return out('E3', 'na', 'Chiến dịch đang tắt — không chỉnh');

  // Lịch sử: bước gần nhất + chuỗi bước liên tiếp
  const hist = tuneHistory(actions, c.id);
  const last = hist[0];
  const waitMs = s.waitHours * 3_600_000;
  const streak = (() => {
    let n = 0;
    for (const a of hist) {
      if (a.params.tune?.revertOf || a.undoOf) break;
      n++;
    }
    return n;
  })();
  if (last && now - Date.parse(last.executedAt) < waitMs) {
    const until = new Date(Date.parse(last.executedAt) + waitMs).toISOString();
    const reverted = !!(last.params.tune?.revertOf || last.undoOf);
    return out('A3', 'testing', reverted ? 'Vừa lùi về số cũ — chờ ổn định rồi mới đổi tiếp' : `Đang thử bước ${Math.max(1, streak)} — chờ đo lại`, { step: Math.max(1, streak), waitUntil: until });
  }
  // Đo bước vừa thử (chưa phải bước lùi / hoàn tác, chưa bị hoàn tác)
  if (s.autoRevert && last && last.status === 'success' && !last.params.tune?.revertOf && !last.undoOf) {
    const j = judgeStep(last, s, econ.breakEven);
    if (j && !j.keep) {
      const back = revertOf(last);
      if (back) return out(j.code!, 'testing', `Bước thử vừa rồi làm ${j.code === 'D2' ? 'đơn giảm' : 'lãi giảm'}: ${j.text} → trả về số cũ`, { action: back });
    }
  }
  // Đã lùi 2 lần liên tiếp trong 14 ngày → đang ở điểm tốt, ngừng thử 7 ngày
  const reverts = hist.filter((a) => (a.params.tune?.revertOf || a.undoOf) && now - Date.parse(a.executedAt) < 14 * DAY);
  const recentRevert = reverts[0];

  if (econ.missingShare > s.missingBeMaxPct) return out('A1', 'na', `${Math.round(econ.missingShare)}% doanh thu là sản phẩm chưa nhập ROI hoà vốn — chưa đánh giá được`);
  if (econ.orders < s.minOrders) return out('A2', 'na', `Mới ${econ.orders} đơn trong khung — cần ít nhất ${s.minOrders} đơn`);
  const mt = c.targetRoi;
  const be = econ.breakEven!;
  const roi = econ.roi ?? 0;
  const floor = be * s.floorK;

  // ── Đang lỗ
  if (econ.profit != null && econ.profit < 0) {
    if (!s.rescue) return out('OFF', 'loss', 'Đang lỗ — nhóm "Cứu chiến dịch lỗ" đang tắt');
    const losses = econ.products.filter((p) => (p.profit ?? 0) < 0);
    const totalLoss = losses.reduce((x, p) => x + (p.profit ?? 0), 0);
    const worst = losses.sort((a, b) => (a.profit ?? 0) - (b.profit ?? 0))[0];
    if (econ.products.length > 1 && worst && totalLoss < 0 && ((worst.profit ?? 0) / totalLoss) * 100 >= s.concentratePct) {
      return out('B3', 'loss', `Lỗ chủ yếu ở "${worst.name}" (${money(worst.profit ?? 0)}) — xử lý sản phẩm này trước, không đụng ROI cả chiến dịch`);
    }
    if (mt == null) return out('A5', 'loss', 'Đang lỗ nhưng chiến dịch không đặt ROI mục tiêu');
    const raisesSince = hist.filter((a) => a.actionType === 'update_roi_target' && (a.params.next?.roasBid ?? 0) > (a.params.prev?.roasBid ?? Infinity) && now - Date.parse(a.executedAt) < 21 * DAY);
    if (raisesSince.length >= 3) return out('B5', 'loss', `Đã nâng ROI mục tiêu ${raisesSince.length} lần mà vẫn lỗ — Sếp xem lại giá bán / sản phẩm / có nên tắt chiến dịch`);
    if (mt < floor) {
      const to = roiTo(mt, Math.min(s.lossRaiseMaxPct, (floor / mt - 1) * 100));
      return out('B1', 'loss', `ROI thực ${fmt(roi)} < hoà vốn ${fmt(be)}; ROI mục tiêu ${fmt(mt)} đặt dưới sàn ${fmt(floor)} → nâng dần lên sàn`, { action: roiAction(mt, to), step: streak + 1 });
    }
    const to = roiTo(mt, s.roiStepPct);
    return out('B2', 'loss', `ROI thực ${fmt(roi)} < hoà vốn ${fmt(be)} dù ROI mục tiêu ${fmt(mt)} đã trên sàn → nâng thêm ${s.roiStepPct}%`, { action: roiAction(mt, to), step: streak + 1 });
  }

  // ── Đang lời
  if (recentRevert && reverts.length >= 2) return out('D5', 'hold', 'Đã lùi 2 lần gần đây — chiến dịch đang ở điểm tốt, tạm không thử');
  if (!s.grow) return out('OFF', 'hold', 'Đang lời — nhóm "Mở rộng chiến dịch lời" đang tắt');
  const use = econ.budgetUse;
  const ceil = roi * s.ceilK;
  const profitText = econ.profit != null ? `lời ${money(econ.profit / Math.max(1, econ.days))}/ngày` : 'đang lời';
  if (roi < floor) {
    if (mt != null && roiTo(mt, s.roiStepPct) <= ceil) return out('C4', 'grow', `Lời mỏng (ROI ${fmt(roi)} sát hoà vốn ${fmt(be)}) → nâng nhẹ ROI mục tiêu`, { action: roiAction(mt, roiTo(mt, s.roiStepPct)), step: streak + 1 });
    return out('C4', 'hold', `Lời mỏng (ROI ${fmt(roi)} sát hoà vốn ${fmt(be)}) — giữ, không tăng ngân sách`);
  }
  if (use != null && use >= s.fullUsePct && c.budget) {
    const to = Math.round((c.budget * (1 + s.budgetStepPct / 100)) / 1000) * 1000;
    return out('C1', 'grow', `${profitText}, tiêu ${Math.round(use)}% ngân sách — TikTok còn tìm được đơn mà hết tiền → tăng ngân sách`, {
      action: { type: 'update_budget', pct: s.budgetStepPct, from: c.budget, to },
      step: streak + 1,
    });
  }
  if (mt == null) return out('A5', 'hold', 'Chiến dịch không đặt ROI mục tiêu — chỉ chỉnh được ngân sách');
  // Vừa lùi bước nâng ROI → lần này đổi hướng (hạ nhẹ để lấy thêm đơn)
  const lastRevertWasRaise = recentRevert ? (recentRevert.params.next?.roasBid ?? 0) < (recentRevert.params.prev?.roasBid ?? 0) : false;
  const lower = (use != null && use < s.slowUsePct) || lastRevertWasRaise;
  if (lower) {
    const to = roiTo(mt, -s.roiStepPct);
    if (to < floor) return out('C9', 'hold', `${profitText}; ROI mục tiêu ${fmt(mt)} đã sát sàn ${fmt(floor)} — giữ`);
    return out('C3', 'grow', `${profitText}, ${use != null && use < s.slowUsePct ? `chỉ tiêu ${Math.round(use)}% ngân sách` : 'vừa lùi bước nâng ROI'} → hạ nhẹ ROI mục tiêu để lấy thêm đơn`, {
      action: roiAction(mt, to),
      step: streak + 1,
    });
  }
  const to = roiTo(mt, s.roiStepPct);
  if (to > ceil) return out('C9', 'hold', `${profitText}; ROI mục tiêu ${fmt(mt)} đã sát ROI thực ${fmt(roi)} — giữ`);
  return out('C2', 'grow', `${profitText}, tiêu ${use != null ? Math.round(use) : '--'}% ngân sách → nâng ROI mục tiêu để giữ đơn mà lời hơn`, {
    action: roiAction(mt, to),
    step: streak + 1,
  });
}

/** Họ tình huống để xác nhận 7 = 14 ngày: cùng hướng hành động mới tính */
const familyOf = (d: TuneDecision) => (d.action ? `${d.action.type}:${Math.sign(d.action.pct)}` : null);

/**
 * Quyết định cho mọi chiến dịch: khung 7 ngày quyết định, khung 14 ngày xác nhận cùng hướng hành động
 * (bước lùi không cần xác nhận). Khác hướng → bỏ hành động, đánh dấu `signal`.
 */
export function tuneDecisions(
  d7: AdsSnapshot,
  d14: AdsSnapshot | null,
  settings: AdsSettings,
  actions: AgentActionLog[],
  now = Date.now(),
): Map<string, TuneDecision & { signal?: boolean }> {
  const out = new Map<string, TuneDecision & { signal?: boolean }>();
  for (const c of d7.campaigns) {
    const d = decideCampaign(c, d7, settings, actions, now);
    if (d.action && !d.action.revertOf && d14) {
      const c14 = d14.campaigns.find((x) => x.id === c.id);
      const d2 = c14 ? decideCampaign({ ...c14, budget: c.budget, targetRoi: c.targetRoi, status: c.status }, d14, settings, actions, now) : null;
      if (!d2 || familyOf(d2) !== familyOf(d)) {
        out.set(c.id, { ...d, action: undefined, kind: 'hold', signal: true, reason: `${d.reason} — 14 ngày chưa cùng hướng, chờ thêm` });
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
