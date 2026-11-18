export type CampaignStatus = 'running' | 'paused';

export type CampaignFilter = 'all' | 'running' | 'paused';

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  /** Số video có chi tiêu trong chiến dịch, null nếu không lấy được */
  selectedVideos: number | null;
  /** Ngân sách ngày (VND), null nếu không lấy được */
  budget: number | null;
  cost: number | null;
  revenue: number | null;
  orders: number | null;
  roi: number | null;
  /** ROI mục tiêu của chiến dịch (roas_bid trên TikTok) */
  targetRoi: number | null;
  hasSuggestion: boolean;
}

export interface AdsSummary {
  totalCost: number | null;
  totalRevenue: number | null;
  totalOrders: number | null;
  roi: number | null;
  videosWithSpend7d: number | null;
  boostedVideos: number | null;
  pendingSuggestions: number | null;
  activeRules: number | null;
  totalRules: number | null;
}

/** Cấu trúc file src/data/ads-snapshot.json (Claude ghi qua MCP tiktok-ads) */
export interface AdsSnapshot {
  /** ISO datetime lần lấy dữ liệu, null = chưa lấy lần nào */
  updatedAt: string | null;
  /** Khoảng ngày của số liệu, dạng yyyy-MM-dd */
  range: { from: string; to: string } | null;
  advertiser: { id: string; name: string; currency: string } | null;
  summary: AdsSummary;
  /** Tổng kỳ liền trước (cùng số ngày) để so sánh KPI; null nếu chưa lấy */
  previousSummary?: PreviousSummary | null;
  campaigns: Campaign[];
  products: AdsProduct[];
  videos: AdsVideo[];
}

/** Tổng của kỳ liền trước (gmv_max_report_get, enable_total_metrics) */
export interface PreviousSummary {
  range: { from: string; to: string };
  totalCost: number | null;
  totalRevenue: number | null;
  totalOrders: number | null;
  roi: number | null;
}

/** Tab trong card danh sách GMV Max */
export type AdsListTab = 'campaigns' | 'products' | 'videos';

/** ID nhóm video (định nghĩa trong settings.groups, Sếp tự sửa/thêm). Mặc định: authorize, cut, scale, watch, stable */
export type VideoAction = string;

/** ID nhóm hoặc 'all' */
export type VideoActionFilter = string;

/** Trạng thái phân phối creative (creative_delivery_status của TikTok) */
export type VideoStatus =
  | 'delivering'
  | 'learning'
  | 'in_queue'
  | 'not_delivering'
  | 'authorization_needed'
  | 'excluded'
  | 'unavailable'
  | 'rejected'
  | 'not_active'
  | 'unknown';

/** video: video TikTok; product_card: thẻ sản phẩm (item_id = -1, không phải video) */
export type CreativeContentType = 'video' | 'product_card';

/** Sản phẩm trong một chiến dịch GMV Max */
export interface AdsProduct {
  /** item_group_id (SPU) */
  id: string;
  campaignId: string;
  name: string;
  imageUrl: string | null;
  videoCount: number | null;
  cost: number | null;
  revenue: number | null;
  orders: number | null;
  roi: number | null;
}

/** Video (creative) quảng cáo cho một sản phẩm */
export interface AdsVideo {
  /** item_id (video TikTok) */
  id: string;
  campaignId: string;
  productId: string;
  contentType: CreativeContentType | null;
  title: string | null;
  thumbnailUrl: string | null;
  /** Tài khoản TikTok đăng video (tên hiển thị) */
  identityName: string | null;
  /** Username tác giả (không có @), dùng để tạo link video. Tra bằng scripts/resolve-video-authors.mjs */
  authorUsername?: string | null;
  status: VideoStatus;
  cost: number | null;
  revenue: number | null;
  orders: number | null;
  roi: number | null;
}

export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}
