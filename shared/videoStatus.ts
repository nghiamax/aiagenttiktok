import type { AdsSnapshot, AdsVideo } from './adsSnapshot.js';

/**
 * TikTok báo GMV Max theo cặp (sản phẩm, video). Video gắn sản phẩm B vẫn có dòng ở sản phẩm A — cùng chiến dịch
 * (chiến dịch nhiều sản phẩm) hoặc ở chiến dịch khác — với trạng thái `authorization_needed` (+ chút số liệu "chéo"),
 * dù đã ủy quyền và đang chạy ở B.
 * → Dòng `authorization_needed` mà cùng video còn dòng khác trạng thái (ưu tiên cùng chiến dịch, không có thì ở chiến dịch
 *   khác) = cần ủy quyền giả: gắn `crossProduct`, `mainCampaignId`, `mainProductId` (dòng chi nhiều nhất), `mainStatus`.
 *   Không đổi `status` gốc. Dùng chung web + server (gọi khi nhận snapshot, kể cả bản cache cũ).
 */
export function annotateCrossProduct(snapshot: AdsSnapshot): AdsSnapshot {
  return { ...snapshot, videos: markCrossProduct(snapshot.videos) };
}

/** Đang phân phối / học / chờ được ưu tiên làm "nơi chạy thật" khi chi bằng nhau */
const ACTIVE = new Set(['delivering', 'learning', 'in_queue']);

/**
 * Gắn crossProduct cho các dòng trong `rows`. Server gọi trên MỌI dòng (kể cả dòng 0 chi) TRƯỚC khi lọc.
 * Dòng đã có nhãn từ server mà trong `rows` (đã lọc) không còn dòng thật → giữ nguyên nhãn (dòng thật bị lọc vì 0 chi).
 */
export function markCrossProduct(rows: AdsVideo[]): AdsVideo[] {
  const better = (cur: AdsVideo | undefined, v: AdsVideo) =>
    !cur ||
    (v.cost ?? 0) > (cur.cost ?? 0) ||
    ((v.cost ?? 0) === (cur.cost ?? 0) && ACTIVE.has(v.status) && !ACTIVE.has(cur.status));
  const sameCampaign = new Map<string, AdsVideo>();
  const anyCampaign = new Map<string, AdsVideo>();
  for (const v of rows) {
    if (v.contentType === 'product_card' || v.status === 'authorization_needed') continue;
    const k = `${v.campaignId}/${v.id}`;
    if (better(sameCampaign.get(k), v)) sameCampaign.set(k, v);
    if (better(anyCampaign.get(v.id), v)) anyCampaign.set(v.id, v);
  }
  return rows.map((v) => {
    if (v.status !== 'authorization_needed' || v.contentType === 'product_card') return v;
    const m = sameCampaign.get(`${v.campaignId}/${v.id}`) ?? anyCampaign.get(v.id);
    if (!m) return v; // giữ nhãn server đã gắn (nếu có)
    return { ...v, crossProduct: true, mainCampaignId: m.campaignId, mainProductId: m.productId, mainStatus: m.status };
  });
}

/** Trạng thái dùng để xét điều kiện TikTok (dòng cần ủy quyền giả → trạng thái ở nơi video chạy thật) */
export const effectiveStatus = (v: AdsVideo) => (v.crossProduct && v.mainStatus ? v.mainStatus : v.status);

/** Dòng cần ủy quyền giả nằm ở chiến dịch khác với nơi video chạy thật */
export const isOtherCampaign = (v: AdsVideo) => !!v.crossProduct && !!v.mainCampaignId && v.mainCampaignId !== v.campaignId;

/** Thao tác gỡ / thêm lại video tối thiểu cần để đè trạng thái (khớp AgentActionLog) */
export interface CreativeActionLike {
  executedAt: string;
  actionType: string;
  status: string;
  target: { campaignId: string; videoId: string };
}

/** Thao tác gỡ / thêm lại đã thành công — dùng làm khoá ổn định (đổi mới tính lại) */
export const creativeSuccesses = <T extends CreativeActionLike>(actions: T[]): T[] =>
  actions.filter((a) => (a.actionType === 'remove_creative' || a.actionType === 'add_creative') && a.status === 'success');

/**
 * Snapshot lưu sẵn (cache tới 6 giờ) chưa biết video vừa được gỡ / thêm lại → đè trạng thái theo Nhật ký:
 * thao tác thành công SAU lúc dựng snapshot, mỗi (chiến dịch, video) lấy thao tác mới nhất.
 * Gỡ → mọi dòng của video trong chiến dịch thành `excluded`; thêm lại → dòng đang `excluded` thành `delivering`.
 * Không có gì đổi → trả nguyên snapshot. Dùng chung web (bảng, nhóm, hộp Tổng quan) + server (Agent).
 */
export function applyRecentActions<S extends AdsSnapshot>(snapshot: S, actions: CreativeActionLike[]): S {
  const since = Date.parse(snapshot.updatedAt ?? '') || 0;
  const latest = new Map<string, CreativeActionLike>();
  for (const a of creativeSuccesses(actions)) {
    const t = Date.parse(a.executedAt);
    if (!(t > since)) continue;
    const k = `${a.target.campaignId}/${a.target.videoId}`;
    const prev = latest.get(k);
    if (!prev || t > Date.parse(prev.executedAt)) latest.set(k, a);
  }
  if (latest.size === 0) return snapshot;
  let changed = false;
  const videos = snapshot.videos.map((v) => {
    if (v.contentType === 'product_card') return v;
    // Dòng cần ủy quyền giả: trạng thái thật nằm ở nơi chạy thật (mainCampaignId)
    const own = latest.get(`${v.campaignId}/${v.id}`);
    const main = v.crossProduct && v.mainCampaignId ? latest.get(`${v.mainCampaignId}/${v.id}`) : undefined;
    let next = v;
    if (own) {
      const status = own.actionType === 'remove_creative' ? 'excluded' : v.status === 'excluded' ? 'delivering' : v.status;
      if (status !== v.status && v.status !== 'authorization_needed') next = { ...next, status };
    }
    if (main && next.mainStatus) {
      const ms = main.actionType === 'remove_creative' ? 'excluded' : next.mainStatus === 'excluded' ? 'delivering' : next.mainStatus;
      if (ms !== next.mainStatus) next = { ...next, mainStatus: ms };
    }
    if (next !== v) changed = true;
    return next;
  });
  return changed ? { ...snapshot, videos } : snapshot;
}
