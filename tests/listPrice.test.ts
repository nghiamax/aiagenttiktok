/** Giá niêm yết TikTok Shop (store_product_get, chỉ đọc) → gợi ý giá bán (Sếp chốt 26/11). TikTok GIẢ LẬP. */
import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as { tool: string; params: Record<string, unknown> }[]);

vi.mock('../server/tiktok/link', () => ({
  requireAccount: () => ({ advertiserId: 'adv1', storeId: 'store1', currency: 'VND' }),
}));
vi.mock('../server/tiktok/mcpClient', () => ({
  callReadTool: async (tool: string, params: Record<string, unknown>) => {
    calls.push({ tool, params });
    if (tool === 'gmv_max_store_list_get') {
      return {
        store_list: [
          { store_id: 'store1', store_authorized_bc_id: 'bcOther', exclusive_authorized_advertiser_info: { advertiser_id: 'other' } },
          { store_id: 'store1', store_authorized_bc_id: 'bc1', exclusive_authorized_advertiser_info: { advertiser_id: 'adv1' } },
        ],
      };
    }
    if (tool === 'store_product_get') {
      const ids = (params.filtering as { item_group_ids: string[] }).item_group_ids;
      return { store_products: ids.map((id) => ({ item_group_id: id, min_price: id === 'bad' ? 'x' : '500000' })) };
    }
    throw new Error(`tool không mong đợi: ${tool}`);
  },
}));

const { fetchListPrices } = await import('../server/ads/buildSnapshot');

describe('fetchListPrices', () => {
  it('lấy bc_id của shop (ưu tiên BC có quyền độc quyền cho tài khoản), gọi theo lô 10 mã, bỏ giá không hợp lệ', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`).concat('bad');
    const prices = await fetchListPrices(ids);
    expect(prices.size).toBe(12);
    expect(prices.get('p0')).toBe(500_000);
    expect(prices.has('bad')).toBe(false);
    const productCalls = calls.filter((c) => c.tool === 'store_product_get');
    expect(productCalls).toHaveLength(2);
    expect(productCalls[0].params).toMatchObject({ bc_id: 'bc1', store_id: 'store1' });
  });
});
