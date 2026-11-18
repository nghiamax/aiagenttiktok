import type { AdsProduct, AdsSnapshot, AdsVideo, Campaign, PreviousSummary } from '../../shared/adsSnapshot.js';
import { config } from '../config.js';
import { callReadTool } from '../tiktok/mcpClient.js';
import { getAuthors } from './authors.js';
import { hasActivity, num, roiOf, toCampaign, toProduct, toVideo, type ReportRow } from './mapping.js';

export interface DateRange {
  from: string;
  to: string;
}

interface ReportData {
  list: ReportRow[];
  page_info?: { page: number; total_page: number };
  total_metrics?: Record<string, string>;
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

/** gmv_max_report_get, gom đủ mọi trang */
async function report(range: DateRange, params: Record<string, unknown>) {
  const rows: ReportRow[] = [];
  let total: Record<string, string> | undefined;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await callReadTool<ReportData>('gmv_max_report_get', {
      advertiser_id: config.tiktok.advertiserId,
      store_ids: [config.tiktok.storeId],
      start_date: range.from,
      end_date: range.to,
      page,
      page_size: PAGE_SIZE,
      ...params,
    });
    rows.push(...(data.list ?? []));
    total ??= data.total_metrics;
    if (!data.page_info || page >= data.page_info.total_page) break;
  }
  return { rows, total };
}

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Kỳ liền trước, cùng số ngày */
export function previousRange({ from, to }: DateRange): DateRange {
  const start = Date.parse(from);
  const days = Math.round((Date.parse(to) - start) / DAY) + 1;
  return { from: iso(start - days * DAY), to: iso(start - DAY) };
}

async function fetchCampaigns(range: DateRange) {
  return report(range, {
    dimensions: ['campaign_id'],
    metrics: ['campaign_name', 'operation_status', 'target_roi_budget', 'roas_bid', 'cost', 'gross_revenue', 'orders'],
    filtering: { gmv_max_promotion_types: ['PRODUCT'] },
    enable_total_metrics: true,
  });
}

async function fetchPrevious(range: DateRange): Promise<PreviousSummary | null> {
  const prev = previousRange(range);
  const { total } = await fetchCampaigns(prev);
  if (!total) return null;
  const totalCost = num(total.cost);
  const totalRevenue = num(total.gross_revenue);
  return { range: prev, totalCost, totalRevenue, totalOrders: num(total.orders), roi: roiOf(totalRevenue, totalCost) };
}

async function fetchProducts(range: DateRange, campaignId: string) {
  const { rows } = await report(range, {
    dimensions: ['item_group_id'],
    metrics: ['product_name', 'product_image_url', 'cost', 'gross_revenue', 'orders'],
    filtering: { campaign_ids: [campaignId] },
  });
  return rows.map((r) => toProduct(r, campaignId));
}

async function fetchVideos(range: DateRange, campaignId: string, productId: string) {
  const { rows } = await report(range, {
    dimensions: ['item_id'],
    metrics: ['title', 'tt_account_name', 'creative_delivery_status', 'shop_content_type', 'cost', 'gross_revenue', 'orders'],
    filtering: { campaign_ids: [campaignId], item_group_ids: [productId] },
  });
  return rows.map((r) => toVideo(r, campaignId, productId)).filter((v): v is AdsVideo => v !== null);
}

/** Dựng snapshot số liệu GMV Max sản phẩm cho khoảng ngày (chỉ gọi tool đọc) */
export async function buildSnapshot(range: DateRange): Promise<AdsSnapshot> {
  const [{ rows: campaignRows, total }, previousSummary] = await Promise.all([
    fetchCampaigns(range),
    fetchPrevious(range).catch(() => null), // thiếu kỳ trước thì chỉ ẩn dòng so sánh
  ]);
  const baseCampaigns = campaignRows.map(toCampaign);

  // Sản phẩm của từng chiến dịch
  const productLists = await Promise.all(baseCampaigns.map((c) => fetchProducts(range, c.id)));
  const baseProducts = productLists.flat();

  // Video của từng (chiến dịch, sản phẩm)
  const videoLists = await Promise.all(baseProducts.map((p) => fetchVideos(range, p.campaignId, p.id)));
  const authors = getAuthors();
  const videos: AdsVideo[] = videoLists.flat().map((v) => ({
    ...v,
    authorUsername: v.contentType === 'video' ? (authors[v.id] ?? null) : null,
  }));

  const spendIds = (list: AdsVideo[]) =>
    new Set(list.filter((v) => v.contentType === 'video' && (v.cost ?? 0) > 0).map((v) => v.id)).size;

  const products: AdsProduct[] = baseProducts
    .map((p) => ({
      ...p,
      videoCount: videos.filter(
        (v) => v.campaignId === p.campaignId && v.productId === p.id && v.contentType === 'video',
      ).length,
    }))
    // Bỏ sản phẩm không hoạt động và không có video nào được giữ
    .filter((p) => hasActivity(p) || p.videoCount > 0);

  const campaigns: Campaign[] = baseCampaigns.map((c) => ({
    ...c,
    selectedVideos: spendIds(videos.filter((v) => v.campaignId === c.id)),
  }));

  const totalCost = num(total?.cost);
  const totalRevenue = num(total?.gross_revenue);

  return {
    updatedAt: new Date().toISOString(),
    range: { from: range.from, to: range.to },
    advertiser: { id: config.tiktok.advertiserId, name: config.tiktok.advertiserName, currency: config.tiktok.currency },
    summary: {
      totalCost,
      totalRevenue,
      totalOrders: num(total?.orders),
      roi: roiOf(totalRevenue, totalCost),
      videosWithSpend7d: spendIds(videos),
      boostedVideos: null,
      pendingSuggestions: null,
      activeRules: null,
      totalRules: null,
    },
    previousSummary,
    campaigns,
    products,
    videos,
  };
}
