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
  const better = (cur: AdsVideo | undefined, v: AdsVideo) => !cur || (v.cost ?? 0) > (cur.cost ?? 0);
  const sameCampaign = new Map<string, AdsVideo>();
  const anyCampaign = new Map<string, AdsVideo>();
  for (const v of snapshot.videos) {
    if (v.contentType === 'product_card' || v.status === 'authorization_needed') continue;
    const k = `${v.campaignId}/${v.id}`;
    if (better(sameCampaign.get(k), v)) sameCampaign.set(k, v);
    if (better(anyCampaign.get(v.id), v)) anyCampaign.set(v.id, v);
  }
  return {
    ...snapshot,
    videos: snapshot.videos.map((v) => {
      const m =
        v.status === 'authorization_needed' && v.contentType !== 'product_card'
          ? (sameCampaign.get(`${v.campaignId}/${v.id}`) ?? anyCampaign.get(v.id))
          : undefined;
      if (!m) {
        if (!v.crossProduct) return v;
        const { crossProduct: _c, mainCampaignId: _mc, mainProductId: _p, mainStatus: _s, ...rest } = v;
        return rest;
      }
      return { ...v, crossProduct: true, mainCampaignId: m.campaignId, mainProductId: m.productId, mainStatus: m.status };
    }),
  };
}

/** Trạng thái dùng để xét điều kiện TikTok (dòng cần ủy quyền giả → trạng thái ở nơi video chạy thật) */
export const effectiveStatus = (v: AdsVideo) => (v.crossProduct && v.mainStatus ? v.mainStatus : v.status);

/** Dòng cần ủy quyền giả nằm ở chiến dịch khác với nơi video chạy thật */
export const isOtherCampaign = (v: AdsVideo) => !!v.crossProduct && !!v.mainCampaignId && v.mainCampaignId !== v.campaignId;
