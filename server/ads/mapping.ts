import type { AdsProduct, AdsVideo, Campaign, VideoStatus } from '../../shared/adsSnapshot.js';

/** Một dòng của gmv_max_report_get: dimensions + metrics đều là chuỗi */
export interface ReportRow {
  dimensions: Record<string, string>;
  metrics: Record<string, string>;
}

/** Chuỗi số của TikTok → number; '-', '', rỗng → null */
export function num(value: string | undefined): number | null {
  if (value === undefined || value === null || value === '' || value === '-') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Chuỗi văn bản; TikTok trả '0' / '-' / '' khi không có → null */
export function text(value: string | undefined): string | null {
  if (!value || value === '0' || value === '-') return null;
  return value;
}

/** ROI = doanh thu ÷ chi phí, làm tròn 4 chữ số; chi phí 0 hoặc thiếu → null (API trả 0.00 giả) */
export function roiOf(revenue: number | null, cost: number | null): number | null {
  if (revenue === null || !cost) return null;
  return Math.round((revenue / cost) * 10_000) / 10_000;
}

const VIDEO_STATUSES: VideoStatus[] = [
  'delivering',
  'learning',
  'in_queue',
  'not_delivering',
  'authorization_needed',
  'excluded',
  'unavailable',
  'rejected',
  'not_active',
];

/** TikTok trả một số mã viết khác (vd NOT_DELIVERYING — sai chính tả của chính API) */
const STATUS_ALIASES: Record<string, VideoStatus> = {
  not_deliverying: 'not_delivering',
};

export function videoStatus(value: string | undefined): VideoStatus {
  const raw = value?.toLowerCase();
  const s = (raw && STATUS_ALIASES[raw]) ?? (raw as VideoStatus | undefined);
  return s && VIDEO_STATUSES.includes(s) ? s : 'unknown';
}

export function hasActivity(m: { cost: number | null; revenue: number | null; orders: number | null }) {
  return (m.cost ?? 0) > 0 || (m.revenue ?? 0) > 0 || (m.orders ?? 0) > 0;
}

/** Video không có chi/đơn/DT chỉ giữ khi đang phân phối / học / chờ */
const KEEP_IDLE_STATUSES = new Set<VideoStatus>(['delivering', 'learning', 'in_queue']);

export function toCampaign(row: ReportRow): Omit<Campaign, 'selectedVideos'> {
  const m = row.metrics;
  const cost = num(m.cost);
  const revenue = num(m.gross_revenue);
  return {
    id: row.dimensions.campaign_id,
    name: text(m.campaign_name) ?? row.dimensions.campaign_id,
    status: m.operation_status === 'ENABLE' ? 'running' : 'paused',
    budget: num(m.target_roi_budget),
    cost,
    revenue,
    orders: num(m.orders),
    roi: roiOf(revenue, cost),
    targetRoi: num(m.roas_bid),
    hasSuggestion: false,
  };
}

export function toProduct(row: ReportRow, campaignId: string): Omit<AdsProduct, 'videoCount'> {
  const m = row.metrics;
  const cost = num(m.cost);
  const revenue = num(m.gross_revenue);
  return {
    id: row.dimensions.item_group_id,
    campaignId,
    name: text(m.product_name) ?? row.dimensions.item_group_id,
    imageUrl: text(m.product_image_url),
    cost,
    revenue,
    orders: num(m.orders),
    roi: roiOf(revenue, cost),
  };
}

/** Dòng video không chi / đơn / DT và không đang phân phối / học / chờ → không giữ trong snapshot */
export const isIdleVideo = (v: Pick<AdsVideo, 'cost' | 'revenue' | 'orders' | 'status'>) =>
  !hasActivity(v) && !KEEP_IDLE_STATUSES.has(v.status);

/** Dòng video → AdsVideo, hoặc null nếu bỏ qua (không hoạt động) */
export function toVideo(row: ReportRow, campaignId: string, productId: string): AdsVideo | null {
  const v = rowToVideo(row, campaignId, productId);
  return isIdleVideo(v) ? null : v;
}

/** Dòng video → AdsVideo (kể cả dòng không hoạt động — dùng để đối chiếu dòng "cần ủy quyền" giả trước khi lọc) */
export function rowToVideo(row: ReportRow, campaignId: string, productId: string): AdsVideo {
  const m = row.metrics;
  const id = row.dimensions.item_id;
  const isCard = id === '-1' || m.shop_content_type === 'PRODUCT_CARD';
  const cost = num(m.cost);
  const revenue = num(m.gross_revenue);
  const orders = num(m.orders);
  const status = videoStatus(m.creative_delivery_status);
  return {
    id,
    campaignId,
    productId,
    contentType: isCard ? 'product_card' : 'video',
    title: isCard ? null : text(m.title),
    thumbnailUrl: null,
    identityName: isCard ? null : text(m.tt_account_name),
    authorUsername: null,
    status,
    cost,
    revenue,
    orders,
    roi: roiOf(revenue, cost),
  };
}
