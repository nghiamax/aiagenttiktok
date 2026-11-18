import { tiktokVideoUrl } from '../metrics';
import type { AdsSnapshot } from '../types';
import type { AgentTarget } from './types';

/* Tra cứu trên snapshot đang xem (useAdsData().snapshot) */

export interface TargetInfo {
  title: string;
  url: string | null;
  identityName: string | null;
  productName: string;
  campaignName: string;
}

/** ROI mục tiêu của chiến dịch (hoặc chiến dịch đầu tiên nếu chưa chọn) — dùng cho ví dụ quy đổi */
export function campaignTargetRoi(snapshot: AdsSnapshot, campaignId: string | null): number | null {
  const c = campaignId ? snapshot.campaigns.find((x) => x.id === campaignId) : snapshot.campaigns[0];
  return c?.targetRoi ?? null;
}

/** Tra tên video / sản phẩm / chiến dịch của một đối tượng */
export function describeTarget(snapshot: AdsSnapshot, t: AgentTarget): TargetInfo {
  // Đối tượng cấp chiến dịch / sản phẩm (không có video)
  if (!t.videoId) {
    const product = t.productId ? snapshot.products.find((p) => p.id === t.productId) : undefined;
    const campaign = snapshot.campaigns.find((c) => c.id === t.campaignId);
    const campaignName = campaign?.name ?? t.campaignId;
    return {
      title: product ? product.name : campaignName,
      url: null,
      identityName: null,
      productName: product ? campaignName : 'Chiến dịch',
      campaignName,
    };
  }

  const video =
    snapshot.videos.find((v) => v.id === t.videoId && v.productId === t.productId) ??
    snapshot.videos.find((v) => v.id === t.videoId);
  const product = snapshot.products.find((p) => p.id === t.productId);
  const campaign = snapshot.campaigns.find((c) => c.id === t.campaignId);
  return {
    title: video?.title || `Video ${t.videoId}`,
    url: tiktokVideoUrl(t.videoId, video?.authorUsername),
    identityName: video?.identityName ?? null,
    productName: product?.name ?? t.productId,
    campaignName: campaign?.name ?? t.campaignId,
  };
}

export function campaignOptionsOf(snapshot: AdsSnapshot) {
  return snapshot.campaigns.map((c) => ({ value: c.id, label: c.name }));
}

/** Sản phẩm để chọn phạm vi quy tắc; lọc theo chiến dịch nếu có */
export function productOptionsFor(snapshot: AdsSnapshot, campaignId: string | null) {
  return snapshot.products
    .filter((p) => !campaignId || p.campaignId === campaignId)
    .map((p) => ({
      value: p.id,
      label: p.name,
      campaignId: p.campaignId,
      imageUrl: p.imageUrl,
      description: campaignId ? undefined : snapshot.campaigns.find((c) => c.id === p.campaignId)?.name,
    }));
}

/** Chiến dịch chứa sản phẩm (để tự đặt chiến dịch khi chọn sản phẩm) */
export function campaignOfProduct(snapshot: AdsSnapshot, productId: string): string | null {
  return snapshot.products.find((p) => p.id === productId)?.campaignId ?? null;
}
