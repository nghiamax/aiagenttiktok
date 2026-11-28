import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * Lỗi 28/11 (localhost): lời gọi TikTok treo không giới hạn giữ chỗ (tối đa 2 lời gọi cùng lúc)
 * → mọi việc sau (tải trang, Quét ngay, quét theo giờ) chờ mãi, không lỗi. Nay quá giờ → huỷ, nhả chỗ.
 * Không gọi TikTok thật: fetch giả lập.
 */
vi.mock('../server/tiktok/auth', () => ({
  getAccessToken: async () => 'token-test',
  TikTokLoginRequired: class TikTokLoginRequired extends Error {},
}));
vi.mock('../server/shopContext', () => ({ currentShopId: () => 'shop-test' }));

const mcp = await import('../server/tiktok/mcpClient');

/** fetch treo tới khi bị huỷ (signal) */
function hangingFetch(_url: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
  });
}

/** fetch trả lời bình thường (initialize / notification / tools/call) */
function okFetch(_url: unknown, init?: RequestInit): Promise<Response> {
  const body = JSON.parse(String(init?.body));
  if (body.id === undefined) return Promise.resolve(new Response('', { status: 202 }));
  const result =
    body.method === 'tools/call'
      ? { content: [{ type: 'text', text: JSON.stringify({ code: 0, message: 'OK', data: { ok: true } }) }] }
      : { protocolVersion: '2025-06-18' };
  return Promise.resolve(new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { headers: { 'content-type': 'application/json' } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  mcp.mcpTiming.timeoutMs = 90_000;
});

describe('Gọi TikTok có giới hạn thời gian chờ', () => {
  it('mặc định 90 giây', () => {
    expect(mcp.mcpTiming.timeoutMs).toBe(90_000);
  });

  it('TikTok treo → lỗi "không phản hồi", chỗ được nhả, lời gọi sau chạy bình thường', async () => {
    mcp.mcpTiming.timeoutMs = 50;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(hangingFetch));
    // 3 lời gọi cùng lúc (quá 2 chỗ) — trước đây treo mãi
    const hung = await Promise.allSettled([1, 2, 3].map(() => mcp.callReadTool('gmv_max_campaign_get', {})));
    for (const r of hung) {
      expect(r.status).toBe('rejected');
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(mcp.TikTokTimeoutError);
      expect(String((r as PromiseRejectedResult).reason.message)).toMatch(/không phản hồi/);
    }
    // TikTok trả lời lại → không còn kẹt
    vi.stubGlobal('fetch', vi.fn(okFetch));
    await expect(mcp.callReadTool('gmv_max_campaign_get', {})).resolves.toEqual({ ok: true });
  });

  it('lỗi quá giờ không bị thử lại như giới hạn tần suất (không kéo dài thêm)', async () => {
    mcp.mcpTiming.timeoutMs = 30;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const f = vi.fn(hangingFetch);
    vi.stubGlobal('fetch', f);
    await expect(mcp.callReadTool('gmv_max_campaign_get', {})).rejects.toBeInstanceOf(mcp.TikTokTimeoutError);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
