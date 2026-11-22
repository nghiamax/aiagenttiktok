/**
 * Đánh giá 3 khung 7 · 14 · 30 ngày (đến hôm qua) — Sếp chốt 22/11/2026.
 * Nhóm "đã xác nhận" = khung 7 ngày và 14 ngày cùng nhóm. Chỉ nhóm đã xác nhận mới được Agent đề xuất / tính ở Tổng quan.
 * Khung 30 ngày chỉ để đánh giá độ tin ("kéo dài" khi cùng nhóm) và giải thích.
 * Không thêm nhóm / ngưỡng mới: xếp nhóm từng khung bằng classify* có sẵn. Dùng chung web + server.
 */
import type { AdsSnapshot, AdsVideo } from './adsSnapshot.js';
import { classifyCampaign, classifyProduct, classifyVideo } from './classify.js';
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

/** Gộp nhóm 3 khung thành kết quả */
export function trendOf(
  level: RuleLevel,
  settings: AdsSettings,
  g: { g7: string | null; g14: string | null; g30: string | null },
  w: { w7: WindowStat | null; w14: WindowStat | null; w30: WindowStat | null },
  /** false = chưa có khung 14 ngày (đang tải / lỗi) hoặc Sếp tắt xác nhận → giữ nhóm 7 ngày */
  canConfirm = true,
): TrendInfo {
  const confirmed = g.g7 != null && (!canConfirm || g.g14 === g.g7 || !needsConfirm(settings, level, g.g7));
  return {
    ...g,
    ...w,
    group: confirmed ? g.g7 : null,
    unconfirmed: g.g7 != null && !confirmed,
    long: confirmed && g.g30 === g.g7,
  };
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
      ),
    );
    if (a?.reason) out.get(key)!.reason = a.reason;
  }
  return out;
}

/** Xếp nhóm mọi đối tượng của một snapshot */
type Classified = { group: string | null; reason?: string; stat: WindowStat };
const cell = (cls: { action: string; reason: string } | null, st: WindowStat): Classified => ({
  group: cls?.action ?? null,
  ...(cls && { reason: cls.reason }),
  stat: st,
});

function classifyAll(level: RuleLevel, s: AdsSnapshot, settings: AdsSettings): Map<string, Classified> {
  const campaignById = new Map(s.campaigns.map((c) => [c.id, c]));
  const m = new Map<string, Classified>();
  if (level === 'campaign') {
    const d = days(s);
    for (const c of s.campaigns) m.set(c.id, cell(classifyCampaign(c, settings, d), stat(c)));
  } else if (level === 'product') {
    for (const p of s.products) m.set(productKey(p.campaignId, p.id), cell(classifyProduct(p, campaignById.get(p.campaignId), settings), stat(p)));
  } else {
    for (const v of s.videos) {
      if (v.contentType !== 'video') continue;
      m.set(videoKey(v), cell(classifyVideo(v, campaignById.get(v.campaignId), settings), stat(v)));
    }
  }
  return m;
}

/** Câu ngắn dưới badge nhóm */
export function trendLabel(t: TrendInfo, groupName: (id: string | null) => string): string | null {
  if (t.unconfirmed) return `dấu hiệu · 14 ngày: ${groupName(t.g14)}`;
  if (!t.group) return null;
  if (t.long) return 'kéo dài 30 ngày';
  return t.g30 == null ? '2 tuần gần đây' : `2 tuần gần đây · 30 ngày: ${groupName(t.g30)}`;
}
