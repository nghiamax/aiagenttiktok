import type { AdsProduct, AdsSnapshot, AdsVideo, Campaign, PreviousSummary } from '../../shared/adsSnapshot.js';
import { requireAccount } from '../tiktok/link.js';
import { callReadTool } from '../tiktok/mcpClient.js';
import { getAuthors } from './authors.js';
import { markCrossProduct } from '../../shared/videoStatus.js';
import { hasActivity, isIdleVideo, num, roiOf, rowToVideo, toCampaign, toProduct, type ReportRow } from './mapping.js';

export interface DateRange {
  from: string;
  to: string;
}

interface ReportData {
  list: ReportRow[];
  page_info?: { page: number; total_page: number };
  total_metrics?: Record<string, string>;
}

/**
 * Phiên bản cách dựng snapshot. ĐỔI CÁCH DỰNG / LỌC / ĐỐI CHIẾU → TĂNG SỐ NÀY để cache cũ (kể cả cache "giữ mãi") tự dựng lại.
 * 2 (21/11/2026): đối chiếu dòng "cần ủy quyền" giả trước khi lọc dòng 0 chi.
 * 3 (25/11/2026): đánh dấu sản phẩm đã loại trừ (`excluded`) theo danh sách sản phẩm đang bật của chiến dịch.
 * 4 (26/11/2026): giá niêm yết TikTok Shop (`listPrice`) cho từng sản phẩm.
 */
export const SNAPSHOT_BUILD = 4;

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

/** gmv_max_report_get, gom đủ mọi trang */
async function report(range: DateRange, params: Record<string, unknown>) {
  const rows: ReportRow[] = [];
  let total: Record<string, string> | undefined;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await callReadTool<ReportData>('gmv_max_report_get', {
      advertiser_id: requireAccount().advertiserId,
      store_ids: [requireAccount().storeId],
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
  return rows.map((r) => rowToVideo(r, campaignId, productId));
}

/**
 * Sản phẩm đang bật của chiến dịch chọn sản phẩm thủ công (CUSTOMIZED_PRODUCTS) → Set item_group_id.
 * Chiến dịch tự chọn sản phẩm / không đọc được → null (không đánh dấu loại trừ — không đoán).
 */
async function fetchEnabledProducts(campaignId: string): Promise<Set<string> | null> {
  try {
    const info = await callReadTool<{ product_specific_type?: string; item_group_ids?: string[] }>('campaign_gmv_max_info_get', {
      advertiser_id: requireAccount().advertiserId,
      campaign_id: campaignId,
    });
    if (info.product_specific_type !== 'CUSTOMIZED_PRODUCTS' || !Array.isArray(info.item_group_ids)) return null;
    return new Set(info.item_group_ids.map(String));
  } catch {
    return null;
  }
}

/** Đánh dấu sản phẩm đã loại trừ theo danh sách đang bật của từng chiến dịch (thuần — để test) */
export function markExcluded<T extends Pick<AdsProduct, 'id' | 'campaignId'>>(products: T[], enabled: Map<string, Set<string> | null>): (T & { excluded?: boolean })[] {
  return products.map((p) => {
    const set = enabled.get(p.campaignId);
    return set && !set.has(p.id) ? { ...p, excluded: true } : p;
  });
}

/** Business Center của shop (store_product_get bắt buộc bc_id) — nhớ trong tiến trình theo shop TikTok */
const bcByStore = new Map<string, string>();
async function storeBcId(advertiserId: string, storeId: string): Promise<string | null> {
  const hit = bcByStore.get(storeId);
  if (hit) return hit;
  const data = await callReadTool<{
    store_list?: { store_id: string; store_authorized_bc_id?: string; exclusive_authorized_advertiser_info?: { advertiser_id?: string } }[];
  }>('gmv_max_store_list_get', { advertiser_id: advertiserId });
  const rows = (data.store_list ?? []).filter((s) => s.store_id === storeId && s.store_authorized_bc_id);
  const pick = rows.find((s) => s.exclusive_authorized_advertiser_info?.advertiser_id === advertiserId) ?? rows[0];
  if (pick?.store_authorized_bc_id) bcByStore.set(storeId, pick.store_authorized_bc_id);
  return pick?.store_authorized_bc_id ?? null;
}

/** Giá niêm yết TikTok Shop theo SPU (min_price; TikTok không trả giá khuyến mãi). Lỗi → map rỗng (không chặn snapshot) */
export async function fetchListPrices(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  try {
    const acct = requireAccount();
    const bcId = await storeBcId(acct.advertiserId, acct.storeId);
    if (!bcId) return out;
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      const data = await callReadTool<{ store_products?: { item_group_id: string; min_price?: string }[] }>('store_product_get', {
        bc_id: bcId,
        store_id: acct.storeId,
        filtering: { item_group_ids: batch },
        page_size: 10,
      });
      for (const p of data.store_products ?? []) {
        const price = Number(p.min_price);
        if (Number.isFinite(price) && price > 0) out.set(String(p.item_group_id), price);
      }
    }
  } catch {
    // không lấy được giá → để trống, web dùng giá trị đơn / Sếp nhập
  }
  return out;
}

/** Dựng snapshot số liệu GMV Max sản phẩm cho khoảng ngày (chỉ gọi tool đọc) */
export async function buildSnapshot(range: DateRange): Promise<AdsSnapshot> {
  const acct = requireAccount();
  const [{ rows: campaignRows, total }, previousSummary] = await Promise.all([
    fetchCampaigns(range),
    fetchPrevious(range).catch(() => null), // thiếu kỳ trước thì chỉ ẩn dòng so sánh
  ]);
  const baseCampaigns = campaignRows.map(toCampaign);

  // Sản phẩm của từng chiến dịch
  const [productLists, enabledLists] = await Promise.all([
    Promise.all(baseCampaigns.map((c) => fetchProducts(range, c.id))),
    Promise.all(baseCampaigns.map((c) => fetchEnabledProducts(c.id))),
  ]);
  const enabled = new Map(baseCampaigns.map((c, i) => [c.id, enabledLists[i]] as const));
  const baseProducts = markExcluded(productLists.flat(), enabled);

  // Video của từng (chiến dịch, sản phẩm). Đối chiếu dòng "cần ủy quyền" giả trên MỌI dòng (kể cả dòng không hoạt động)
  // rồi mới bỏ dòng không hoạt động — nếu lọc trước, dòng thật 0 chi ở sản phẩm khác bị mất, dòng giả bị coi là thật.
  const videoLists = await Promise.all(baseProducts.map((p) => fetchVideos(range, p.campaignId, p.id)));
  const authors = getAuthors();
  const videos: AdsVideo[] = markCrossProduct(videoLists.flat()).filter((v) => !isIdleVideo(v)).map((v) => ({
    ...v,
    authorUsername: v.contentType === 'video' ? (authors[v.id] ?? null) : null,
  }));

  const spendIds = (list: AdsVideo[]) =>
    new Set(list.filter((v) => v.contentType === 'video' && (v.cost ?? 0) > 0).map((v) => v.id)).size;

  const listPrices = await fetchListPrices([...new Set(baseProducts.map((p) => p.id))]);
  const products: AdsProduct[] = baseProducts
    .map((p) => ({
      ...p,
      listPrice: listPrices.get(p.id) ?? null,
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
    build: SNAPSHOT_BUILD,
    updatedAt: new Date().toISOString(),
    range: { from: range.from, to: range.to },
    advertiser: { id: acct.advertiserId, name: acct.advertiserName ?? acct.storeName ?? acct.advertiserId, currency: acct.currency },
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
