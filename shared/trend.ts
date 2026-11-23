/**
 * Đánh giá 3 khung 7 · 14 · 30 ngày (đến hôm qua) — Sếp chốt 22/11/2026.
 * Nhóm "đã xác nhận" = khung 7 ngày và 14 ngày cùng nhóm. Chỉ nhóm đã xác nhận mới được Agent đề xuất / tính ở Tổng quan.
 * Khung 30 ngày chỉ để đánh giá độ tin ("kéo dài" khi cùng nhóm) và giải thích.
 * Không thêm nhóm / ngưỡng mới: xếp nhóm từng khung bằng classify* có sẵn. Dùng chung web + server.
 */
import type { AdsSnapshot, AdsVideo } from './adsSnapshot.js';
import { classifyCampaign, classifyProduct, classifyVideo, contextForCampaign, contextForProduct, contextForVideo } from './classify.js';
import { matchSet, type Clause, type EvalContext, type GroupDef } from './groups.js';
import { findGroup, type AdsSettings } from './settings.js';
import type { RuleLevel } from './agentTypes.js';

export const TREND_DAYS = [7, 14, 30] as const;

/** Số liệu của một khung */
export interface WindowStat {
  cost: number | null;
  revenue: number | null;
  orders: number | null;
  roi: number | null;
}

export interface TrendInfo {
  /** Nhóm ở từng khung (null = không có số / không xếp nhóm) */
  g7: string | null;
  g14: string | null;
  g30: string | null;
  w7: WindowStat | null;
  w14: WindowStat | null;
  w30: WindowStat | null;
  /** Nhóm đã xác nhận (7 = 14, hoặc nhóm không cần xác nhận); null = chưa xác nhận / không có nhóm */
  group: string | null;
  /** Có nhóm 7 ngày nhưng 14 ngày khác nhóm */
  unconfirmed: boolean;
  /** Đã xác nhận và 30 ngày cùng nhóm */
  long: boolean;
  /** Lý do xếp nhóm ở khung 7 ngày (tooltip) */
  reason?: string;
  /**
   * Lỗ âm thầm: 14 + 30 ngày cùng nhóm có ngưỡng chi (vd Cắt lỗ), 7 ngày chi ít chưa tới ngưỡng nhưng các điều kiện
   * còn lại vẫn khớp (0 đơn / ROI < hoà vốn) → coi là đã thuộc nhóm (group = nhóm 14 ngày)
   */
  slowLoss?: boolean;
  /** Đang hồi phục: 14 + 30 ngày thuộc nhóm có ngưỡng chi nhưng 7 ngày gần nhất đã không còn khớp → không làm gì */
  recovering?: boolean;
}

export interface TrendSnaps {
  d7: AdsSnapshot;
  /** Thiếu (đang tải / lỗi) → không xác nhận được, coi như chỉ xét 7 ngày */
  d14: AdsSnapshot | null;
  d30: AdsSnapshot | null;
}

/** Khoá đối tượng theo cấp: video = chiến dịch/sản phẩm/video (1 dòng); sản phẩm = chiến dịch/sản phẩm; chiến dịch = id */
export const videoKey = (v: Pick<AdsVideo, 'campaignId' | 'productId' | 'id'>) => `${v.campaignId}/${v.productId}/${v.id}`;
export const productKey = (campaignId: string, productId: string) => `${campaignId}/${productId}`;

const stat = (x: { cost: number | null; revenue: number | null; orders: number | null; roi: number | null }): WindowStat => ({
  cost: x.cost,
  revenue: x.revenue,
  orders: x.orders,
  roi: x.roi,
});

const days = (s: AdsSnapshot) =>
  s.range ? Math.round((Date.parse(s.range.to) - Date.parse(s.range.from)) / 86_400_000) + 1 : 7;

/** Nhóm cần xác nhận? Nhóm theo trạng thái TikTok (Cần ủy quyền) không phụ thuộc khung thời gian → không cần */
function needsConfirm(settings: AdsSettings, level: RuleLevel, group: string): boolean {
  return findGroup(settings, group, level)?.kind !== 'platform';
}

/** Điều kiện "chi tối thiểu" (Chi phí ≥ / >) — ngưỡng phụ thuộc độ dài khung, khung ngắn dễ chưa chạm */
const isSpendGate = (c: Clause) => c.metric === 'cost' && (c.op === 'gte' || c.op === 'gt');

/** Nhóm có ngưỡng chi tối thiểu (vd Cắt lỗ "Chi ≥ 100k và 0 đơn") → video tiêu ít có thể lọt ở khung 7 ngày */
export const isSpendGated = (g: GroupDef | undefined) =>
  !!g && g.kind === 'custom' && g.conditionSets.some((s) => s.clauses.some(isSpendGate));

/** Khớp nhóm khi bỏ riêng ngưỡng chi tối thiểu (dùng đúng điều kiện Sếp đặt, không thêm ngưỡng mới) */
export function matchesIgnoringSpend(g: GroupDef, ctx: EvalContext): boolean {
  return g.conditionSets.some((s) => matchSet({ clauses: s.clauses.filter((c) => !isSpendGate(c)) }, ctx));
}

/**
 * Cửa vào thứ 2 (Sếp chốt 22/11): 14 và 30 ngày cùng nhóm G có ngưỡng chi, 7 ngày khác nhóm, 7 ngày vẫn còn chi.
 * 7 ngày vẫn khớp G khi bỏ ngưỡng chi → "lỗ âm thầm"; không khớp → "đang hồi phục". Còn lại → null.
 */
export function slowCheck(
  level: RuleLevel,
  settings: AdsSettings,
  g: { g7: string | null; g14: string | null; g30: string | null },
  ctx7: EvalContext | null,
): 'slowLoss' | 'recovering' | null {
  if (!g.g14 || g.g14 !== g.g30 || g.g7 === g.g14 || !ctx7 || ctx7.cost <= 0) return null;
  const G = findGroup(settings, g.g14, level);
  if (!G || !isSpendGated(G)) return null;
  return matchesIgnoringSpend(G, ctx7) ? 'slowLoss' : 'recovering';
}

/** Gộp nhóm 3 khung thành kết quả */
export function trendOf(
  level: RuleLevel,
  settings: AdsSettings,
  g: { g7: string | null; g14: string | null; g30: string | null },
  w: { w7: WindowStat | null; w14: WindowStat | null; w30: WindowStat | null },
  /** false = chưa có khung 14 ngày (đang tải / lỗi) hoặc Sếp tắt xác nhận → giữ nhóm 7 ngày */
  canConfirm = true,
  /** Bối cảnh 7 ngày để xét "lỗ âm thầm" / "đang hồi phục" */
  ctx7: EvalContext | null = null,
): TrendInfo {
  const confirmed = g.g7 != null && (!canConfirm || g.g14 === g.g7 || !needsConfirm(settings, level, g.g7));
  const base: TrendInfo = {
    ...g,
    ...w,
    group: confirmed ? g.g7 : null,
    unconfirmed: g.g7 != null && !confirmed,
    long: confirmed && g.g30 === g.g7,
  };
  if (confirmed || !canConfirm) return base;
  const slow = slowCheck(level, settings, g, ctx7);
  if (slow === 'slowLoss') return { ...base, group: g.g14, unconfirmed: false, long: true, slowLoss: true };
  if (slow === 'recovering') return { ...base, recovering: true };
  return base;
}

/** Bảng xu hướng cho mọi đối tượng của một cấp (khoá theo videoKey / productKey / id chiến dịch) */
export function buildTrendIndex(level: RuleLevel, snaps: TrendSnaps, settings: AdsSettings, canConfirm = true): Map<string, TrendInfo> {
  const list = [snaps.d7, snaps.d14, snaps.d30];
  const perSnap = list.map((s) => (s ? classifyAll(level, s, settings) : null));
  const out = new Map<string, TrendInfo>();
  const keys = new Set<string>(perSnap[0]?.keys() ?? []);
  for (const key of keys) {
    const [a, b, c] = perSnap.map((m) => m?.get(key) ?? null);
    out.set(
      key,
      trendOf(
        level,
        settings,
        { g7: a?.group ?? null, g14: b?.group ?? null, g30: c?.group ?? null },
        { w7: a?.stat ?? null, w14: b?.stat ?? null, w30: c?.stat ?? null },
        canConfirm && !!snaps.d14,
        a?.ctx ?? null,
      ),
    );
    if (a?.reason) out.get(key)!.reason = a.reason;
  }
  return out;
}

/** Xếp nhóm mọi đối tượng của một snapshot */
type Classified = { group: string | null; reason?: string; stat: WindowStat; ctx: EvalContext };
const cell = (cls: { action: string; reason: string } | null, st: WindowStat, ctx: EvalContext): Classified => ({
  group: cls?.action ?? null,
  ...(cls && { reason: cls.reason }),
  stat: st,
  ctx,
});

function classifyAll(level: RuleLevel, s: AdsSnapshot, settings: AdsSettings): Map<string, Classified> {
  const campaignById = new Map(s.campaigns.map((c) => [c.id, c]));
  const m = new Map<string, Classified>();
  if (level === 'campaign') {
    const d = days(s);
    for (const c of s.campaigns) m.set(c.id, cell(classifyCampaign(c, settings, d), stat(c), contextForCampaign(c, d)));
  } else if (level === 'product') {
    for (const p of s.products) {
      const camp = campaignById.get(p.campaignId);
      m.set(productKey(p.campaignId, p.id), cell(classifyProduct(p, camp, settings), stat(p), contextForProduct(p, camp, settings)));
    }
  } else {
    for (const v of s.videos) {
      if (v.contentType !== 'video') continue;
      const camp = campaignById.get(v.campaignId);
      m.set(videoKey(v), cell(classifyVideo(v, camp, settings), stat(v), contextForVideo(v, camp, settings)));
    }
  }
  return m;
}

/** Nhãn 1–2 từ dưới badge nhóm (câu đầy đủ ở trendDetail, hiện khi rê chuột) */
export function trendLabel(t: TrendInfo): string | null {
  if (t.slowLoss) return 'lỗ âm thầm';
  if (t.recovering) return 'đang hồi phục';
  if (t.unconfirmed) return 'dấu hiệu';
  if (!t.group) return null;
  return t.long ? 'kéo dài' : '2 tuần';
}

/** Câu ngắn (tooltip nhãn dưới badge) */
export function trendDetail(t: TrendInfo, groupName: (id: string | null) => string): string | null {
  if (t.slowLoss) return `7N chi chưa tới ngưỡng · 14 · 30N: ${groupName(t.group)}`;
  if (t.recovering) return `14 · 30N: ${groupName(t.g14)} · 7N đã tốt lên`;
  if (t.unconfirmed) return `7N: ${groupName(t.g7)} · 14N: ${groupName(t.g14)} — chờ thêm`;
  if (!t.group) return null;
  return t.long ? '7 · 14 · 30N cùng nhóm' : `7 · 14N cùng nhóm · 30N: ${groupName(t.g30)}`;
}
