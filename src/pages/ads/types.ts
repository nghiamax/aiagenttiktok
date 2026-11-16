export type CampaignStatus = 'running' | 'paused';

export type CampaignFilter = 'all' | 'running' | 'paused' | 'suggested';

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
  campaigns: Campaign[];
}
