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
