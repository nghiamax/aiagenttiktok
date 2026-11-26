/**
 * Kiểu dữ liệu số liệu ADS dùng chung giữa web (src/) và server (server/).
 * Server dựng đúng cấu trúc này từ MCP TikTok; web hiển thị.
 */

export type CampaignStatus = 'running' | 'paused';

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

/** Tổng của kỳ liền trước (gmv_max_report_get, enable_total_metrics) */
export interface PreviousSummary {
  range: { from: string; to: string };
  totalCost: number | null;
  totalRevenue: number | null;
  totalOrders: number | null;
  roi: number | null;
}

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
  /**
   * Đã tắt khỏi chiến dịch (chiến dịch chọn sản phẩm thủ công, sản phẩm không còn trong danh sách đang bật).
   * Thiếu = đang bật hoặc không biết (chiến dịch tự chọn sản phẩm / không đọc được).
   */
  excluded?: boolean;
  /** Giá niêm yết trên TikTok Shop (store_product_get, chưa trừ khuyến mãi) — gợi ý giá bán cho sản phẩm chưa có đơn */
  listPrice?: number | null;
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
  /**
   * Dòng "Cần ủy quyền" giả của chiến dịch nhiều sản phẩm: video đang chạy ở sản phẩm khác (annotateCrossProduct).
   * Có thể ở chiến dịch khác. mainCampaignId / mainProductId / mainStatus = nơi video chạy thật và trạng thái ở đó.
   */
  crossProduct?: boolean;
  mainCampaignId?: string;
  mainProductId?: string;
  mainStatus?: VideoStatus;
  cost: number | null;
  revenue: number | null;
  orders: number | null;
  roi: number | null;
}

/** Cấu trúc snapshot số liệu (file src/data/ads-snapshot.json hoặc API /api/ads/snapshot) */
export interface AdsSnapshot {
  /** Phiên bản cách dựng snapshot (server) — cache khác phiên bản được dựng lại */
  build?: number;
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

/**
 * Snapshot rỗng (không có số liệu nào) — dùng khi chưa đăng nhập web (chế độ khách).
 * KHÔNG dùng src/data/ads-snapshot.json cho khách: file đó là số liệu thật của shop.
 */
export function emptySnapshot(): AdsSnapshot {
  return {
    updatedAt: null,
    range: null,
    advertiser: null,
    summary: {
      totalCost: null,
      totalRevenue: null,
      totalOrders: null,
      roi: null,
      videosWithSpend7d: null,
      boostedVideos: null,
      pendingSuggestions: null,
      activeRules: null,
      totalRules: null,
    },
    previousSummary: null,
    campaigns: [],
    products: [],
    videos: [],
  };
}
