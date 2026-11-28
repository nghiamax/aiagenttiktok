import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdsSnapshot } from '../shared/adsSnapshot';
import type { AgentActionLog, AgentActionType, AgentConfig, AgentProposal, AgentRuleParams, AgentRuntime } from '../shared/agentTypes';
import { GUARDRAILS, snapshot, video } from './fixtures';
import { CREATIVE_INLINE_CHECKS_MS, CREATIVE_VERIFY_STEPS } from '../shared/agentPolicy';

/* Bộ thực thi (giai đoạn C) với TikTok GIẢ LẬP: không gửi lệnh thật, không đụng file thật */

interface Info {
  campaign_id: string;
  operation_status: string;
  store_id: string;
  budget: number;
  roas_bid: number;
  deep_bid_type: string;
  product_specific_type: string;
  product_video_specific_type: string;
  item_group_ids: string[];
}

const mock = vi.hoisted(() => ({
  runtime: null as unknown as AgentRuntime,
  config: null as unknown as AgentConfig,
  snapshot: null as unknown as AdsSnapshot,
  info: null as unknown as Info,
  /** Trạng thái video theo `${productId}/${videoId}` */
  videoStatus: {} as Record<string, string>,
  exclusive: true,
  /** Lời gọi tool ghi */
  writes: [] as { tool: string; params: Record<string, unknown> }[],
  writeError: null as Error | null,
  /** Sau khi ghi, info trả giá trị mới */
  applyWrites: true,
  /** Kết quả xét lại đề xuất theo số liệu mới (null = vẫn khớp) */
  outdatedReason: null as string | null,
  /** Sau lệnh gỡ / thêm video, TikTok đổi trạng thái video ngay */
  applyCreative: false,
}));

vi.mock('../server/ads/cache', () => ({
  todayVN: () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10), // theo giờ giả lập (NOW = 19/11)
  getSnapshot: async () => ({ snapshot: mock.snapshot, cached: true }),
}));

vi.mock('../server/agent/engine', () => ({
  recheckProposal: () => (mock.outdatedReason ? { ok: false, reason: mock.outdatedReason } : { ok: true, match: {} }),
  loadConfirmSnaps: async () => ({ d14: null, d30: null }),
  withRecentActions: <T,>(s: T) => s,
}));

vi.mock('../server/store', () => ({
  getAgentConfig: () => mock.config,
  getSettings: () => ({}),
  getRuntime: () => structuredClone(mock.runtime),
  updateRuntime: (fn: (r: AgentRuntime) => AgentRuntime | void) => {
    const r = structuredClone(mock.runtime);
    mock.runtime = fn(r) ?? r;
    return mock.runtime;
  },
}));

// Shop đang chạy tài khoản quảng cáo / shop TikTok này (bình thường lấy từ database theo shop)
vi.mock('../server/tiktok/link', () => {
  const account = { advertiserId: '7579465349544869906', advertiserName: 'Shop', storeId: '7496093946365052968', storeName: 'Shop', currency: 'VND' };
  return { requireAccount: () => account, getAccount: () => account };
});

vi.mock('../server/tiktok/mcpClient', () => ({
  TikTokTimeoutError: class TikTokTimeoutError extends Error {},
  callReadTool: async (tool: string, params: Record<string, unknown>) => {
    if (tool === 'campaign_gmv_max_info_get') return structuredClone(mock.info);
    if (tool === 'gmv_max_store_list_get') {
      return {
        store_list: [
          {
            store_id: '7496093946365052968',
            exclusive_authorized_advertiser_info: { advertiser_id: mock.exclusive ? '7579465349544869906' : 'other' },
          },
        ],
      };
    }
    if (tool === 'gmv_max_report_get') {
      const productId = (params.filtering as { item_group_ids: string[] }).item_group_ids[0];
      const list = Object.entries(mock.videoStatus)
        .filter(([k]) => k.startsWith(`${productId}/`))
        .map(([k, s]) => ({ dimensions: { item_id: k.split('/')[1] }, metrics: { creative_delivery_status: s } }));
      return { list, page_info: { total_page: 1 } };
    }
    throw new Error(`tool đọc không mong đợi: ${tool}`);
  },
  callWithRetry: async (tool: string, params: Record<string, unknown>) => {
    mock.writes.push({ tool, params });
    if (mock.writeError) throw mock.writeError;
    if (mock.applyCreative && tool === 'gmv_max_creative_update') {
      const item = (params.item_list as { item_id: string; spu_id_list: string[] }[])[0];
      for (const spu of item.spu_id_list) mock.videoStatus[`${spu}/${item.item_id}`] = params.action === 'REMOVE' ? 'EXCLUDED' : 'DELIVERING';
    }
    if (mock.applyWrites && tool === 'campaign_gmv_max_update') {
      if (params.budget !== undefined) mock.info.budget = params.budget as number;
      if (params.roas_bid !== undefined) mock.info.roas_bid = params.roas_bid as number;
      if (params.item_group_ids !== undefined) mock.info.item_group_ids = params.item_group_ids as string[];
    }
    return {};
  },
}));

const ex = await import('../server/agent/executor');

const NOW = new Date('2026-11-19T05:00:00Z');

function proposal(actionType: AgentActionType, params: AgentRuleParams = {}, over: Partial<AgentProposal> = {}): AgentProposal {
  const p: AgentProposal = {
    id: `p-${mock.runtime.proposals.length + 1}`,
    createdAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 24 * 3_600_000).toISOString(),
    ruleId: 'r1',
    actionType,
    target: { campaignId: 'c1', productId: 'p1', videoId: actionType.includes('creative') ? 'v1' : '' },
    params,
    reason: 'test',
    before: { from: '', to: '', cost: 1, revenue: 0, orders: 0, roi: 0, breakEven: null },
    status: 'pending',
    ...over,
  };
  mock.runtime.proposals.unshift(p);
  return p;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mock.runtime = { lastRunAt: null, proposals: [], actions: [] };
  mock.config = { paused: false, rules: [], guardrails: { ...GUARDRAILS } };
  mock.snapshot = snapshot({
    videos: [
      video({ id: 'v1', campaignId: 'c1', productId: 'p1' }),
      video({ id: 'v1', campaignId: 'c1', productId: 'p2' }), // cùng video gắn 2 sản phẩm
    ],
  });
  mock.info = {
    campaign_id: 'c1',
    operation_status: 'ENABLE',
    store_id: '7496093946365052968',
    budget: 1_000_000,
    roas_bid: 5,
    deep_bid_type: 'VO_MIN_ROAS',
    product_specific_type: 'CUSTOMIZED_PRODUCTS',
    product_video_specific_type: 'AUTO_SELECTION',
    item_group_ids: ['p1', 'p2'],
  };
  mock.videoStatus = { 'p1/v1': 'DELIVERING' };
  mock.exclusive = true;
  mock.writes = [];
  mock.writeError = null;
  mock.applyWrites = true;
  mock.applyCreative = false;
  mock.outdatedReason = null;
  ex.executorTiming.inlineChecksMs = [0, 0, 0];
  ex.executorTiming.followUp = false;
});

const actionOf = (id: string) => mock.runtime.actions.find((a) => a.id === id)!;
const updateAction = (id: string, patch: Partial<AgentActionLog>) => Object.assign(actionOf(id), patch);

describe('Gỡ / thêm video (gmv_max_creative_update)', () => {
  it('gửi đúng tham số, gộp mọi sản phẩm của video; trả kết quả ngay, đọc trạng thái ở nền → thành công', async () => {
    mock.applyCreative = true;
    const p = proposal('remove_creative');
    const r = await ex.executeProposal(p.id);
    expect(mock.writes).toEqual([
      {
        tool: 'gmv_max_creative_update',
        params: {
          advertiser_id: '7579465349544869906',
          campaign_id: 'c1',
          action: 'REMOVE',
          item_list: [{ item_id: 'v1', spu_id_list: ['p1', 'p2'] }],
        },
      },
    ]);
    expect(r.action.status).toBe('running'); // không chờ TikTok cập nhật trong lúc bấm Xác nhận
    expect(mock.runtime.proposals[0]).toMatchObject({ status: 'approved', actionId: r.action.id });
    await ex.followUpCreative(r.action.id);
    expect(actionOf(r.action.id).status).toBe('success');
    expect(actionOf(r.action.id).verifyAfter).toBeUndefined();
  });

  it('dòng thật bị lọc khỏi snapshot (0 chi) → spu_id_list vẫn có sản phẩm thật lấy từ nhãn "cần ủy quyền giả"', async () => {
    mock.snapshot = snapshot({
      videos: [
        video({ id: 'v1', campaignId: 'c1', productId: 'p1', status: 'authorization_needed', crossProduct: true, mainCampaignId: 'c1', mainProductId: 'p3', mainStatus: 'not_delivering' }),
      ],
    });
    await ex.executeProposal(proposal('remove_creative').id);
    const item = (mock.writes[0].params.item_list as { spu_id_list: string[] }[])[0];
    expect(item.spu_id_list.sort()).toEqual(['p1', 'p3']);
  });

  // Sếp chốt 28/11: API báo cáo trả trạng thái chậm hơn Ads Manager → 0–3 phút đang chờ, 3–90 phút "Chưa xác nhận", quá 90 phút Lỗi
  it('TikTok chưa đổi trạng thái → bộ kiểm tra ngầm 10 giây/lần tới phút 3 (dự phòng), 1 phút/lần tới phút 30, rồi 3 phút/lần; vẫn chờ (không Lỗi) tới 90 phút', async () => {
    const r = await ex.executeProposal(proposal('remove_creative').id);
    expect(r.action.status).toBe('running');
    expect(Date.parse(r.action.verifyAfter!) - NOW.getTime()).toBe(10_000);
    expect(await ex.verifyPendingActions()).toBe(0); // chưa tới giờ → không đọc

    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    expect(await ex.verifyPendingActions()).toBe(0);
    const a1 = actionOf(r.action.id);
    expect(Date.parse(a1.verifyAfter!) - (NOW.getTime() + 60_000)).toBe(10_000);
    expect(a1).toMatchObject({ status: 'running', note: 'Đang chờ TikTok xác nhận', verifyCount: 1 });
    expect(a1.lastCheckedAt).toBe(new Date(NOW.getTime() + 60_000).toISOString());

    vi.setSystemTime(new Date(NOW.getTime() + 5 * 60_000));
    expect(await ex.verifyPendingActions()).toBe(0);
    const a5 = actionOf(r.action.id);
    expect(a5).toMatchObject({ status: 'running', note: 'Chưa xác nhận', verifyCount: 2 });
    expect(Date.parse(a5.verifyAfter!) - (NOW.getTime() + 5 * 60_000)).toBe(60_000);

    vi.setSystemTime(new Date(NOW.getTime() + 40 * 60_000));
    await ex.verifyPendingActions();
    expect(actionOf(r.action.id).status).toBe('running');
    expect(Date.parse(actionOf(r.action.id).verifyAfter!) - (NOW.getTime() + 40 * 60_000)).toBe(180_000);

    mock.videoStatus['p1/v1'] = 'EXCLUDED';
    vi.setSystemTime(new Date(NOW.getTime() + 44 * 60_000));
    expect(await ex.verifyPendingActions()).toBe(1);
    expect(actionOf(r.action.id)).toMatchObject({ status: 'success', note: 'TikTok xác nhận sau 44 phút' });
  });

  it('3 phút đầu đọc ngay trong lệnh, cách nhau tối đa 10 giây; bộ kiểm tra ngầm không đọc chồng; thấy trạng thái mới là dừng', () => {
    // Nhịp chốt 28/11: 30 giây đầu 3 giây/lần, sau đó nghỉ 8 giây/lần tới hết phút 3
    expect(CREATIVE_INLINE_CHECKS_MS.every((ms) => ms <= 8_000)).toBe(true);
    expect(CREATIVE_INLINE_CHECKS_MS.slice(0, 10)).toEqual(Array(10).fill(3_000));
    const total = CREATIVE_INLINE_CHECKS_MS.reduce((s, ms) => s + ms, 0);
    expect(total).toBeGreaterThanOrEqual(180_000);
    expect(CREATIVE_VERIFY_STEPS[0]).toEqual({ untilMin: 3, everySec: 10 });
  });

  it('trong lúc đọc ngay trong lệnh, bộ kiểm tra ngầm chờ tới hết vòng đọc', async () => {
    ex.executorTiming.inlineChecksMs = [0, 0];
    const r = await ex.executeProposal(proposal('remove_creative').id);
    await ex.followUpCreative(r.action.id);
    const a = actionOf(r.action.id);
    expect(a).toMatchObject({ status: 'running', verifyCount: 2 });
    // vòng đọc 0 ms + 30 giây dự phòng → bộ kiểm tra ngầm chưa đọc ngay
    expect(Date.parse(a.verifyAfter!) - NOW.getTime()).toBe(30_000);
    expect(await ex.verifyPendingActions()).toBe(0);
    expect(actionOf(r.action.id).verifyCount).toBe(2);
    // thấy trạng thái mới → dừng ngay, không đọc thêm
    mock.videoStatus['p1/v1'] = 'EXCLUDED';
    ex.executorTiming.inlineChecksMs = [0, 0, 0, 0];
    await ex.followUpCreative(r.action.id);
    expect(actionOf(r.action.id)).toMatchObject({ status: 'success', verifyCount: 3 });
  });

  it('nút Kiểm tra ngay: chỉ đọc, không gửi lệnh ghi', async () => {
    const r = await ex.executeProposal(proposal('remove_creative').id);
    const writes = mock.writes.length;
    expect((await ex.verifyAction(r.action.id)).action.status).toBe('running');
    mock.videoStatus['p1/v1'] = 'EXCLUDED';
    const v = await ex.verifyAction(r.action.id);
    expect(v.action.status).toBe('success');
    expect(v.message).toContain('đã ghi nhận');
    expect(mock.writes).toHaveLength(writes);
    await expect(ex.verifyAction(r.action.id)).rejects.toThrow('không còn chờ');
  });

  it('quá 90 phút vẫn chưa thấy → Lỗi; Kiểm tra ngay trên dòng Lỗi (trong 24 giờ) → TikTok ghi nhận muộn → Thành công', async () => {
    const r = await ex.executeProposal(proposal('remove_creative').id);
    vi.setSystemTime(new Date(NOW.getTime() + 95 * 60_000));
    expect(await ex.verifyPendingActions()).toBe(1);
    const failed = actionOf(r.action.id);
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('Sau 90 phút TikTok vẫn chưa gỡ video');
    expect(failed.lateCheckUntil).toBeUndefined();
    // Không đọc ở nền nữa
    mock.videoStatus['p1/v1'] = 'EXCLUDED';
    vi.setSystemTime(new Date(NOW.getTime() + 100 * 60_000));
    expect(await ex.verifyPendingActions()).toBe(0);
    expect(actionOf(r.action.id).status).toBe('failed');
    // Sếp thấy trên Ads Manager → Kiểm tra ngay
    const v = await ex.verifyAction(r.action.id);
    expect(v.action).toMatchObject({ status: 'success', note: expect.stringContaining('ghi nhận muộn') });
    expect(v.action.error).toBeUndefined();
  });

  it('dòng lỗi kiểu cũ (lỗi sau 2 phút, còn lateCheckUntil) vẫn đọc ở nền → ghi nhận muộn → Thành công', async () => {
    const r = await ex.executeProposal(proposal('remove_creative').id);
    updateAction(r.action.id, {
      status: 'failed',
      error: 'Sau 2 phút TikTok chưa gỡ video',
      lateCheckUntil: new Date(NOW.getTime() + 90 * 60_000).toISOString(),
      verifyAfter: undefined,
    });
    mock.videoStatus['p1/v1'] = 'EXCLUDED';
    vi.setSystemTime(new Date(NOW.getTime() + 20 * 60_000));
    expect(await ex.verifyPendingActions()).toBe(1);
    expect(actionOf(r.action.id)).toMatchObject({ status: 'success', note: expect.stringContaining('ghi nhận muộn') });
  });

  it('Gửi lại: chỉ sau 3 phút (Chưa xác nhận) hoặc Lỗi, đọc trạng thái trước, tối đa 2 lần', async () => {
    const r = await ex.executeProposal(proposal('remove_creative').id);
    await expect(ex.retryAction(r.action.id)).rejects.toThrow('chưa xác nhận sau 3 phút');
    vi.setSystemTime(new Date(NOW.getTime() + 3 * 60_000));
    await ex.verifyPendingActions();
    expect(actionOf(r.action.id).status).toBe('running');

    const writes = mock.writes.length;
    const r1 = await ex.retryAction(r.action.id);
    expect(mock.writes).toHaveLength(writes + 1);
    expect(r1.action.retryOf).toBe(r.action.id);
    // Dòng đang chờ → thôi đọc, ghi đã gửi lại
    expect(actionOf(r.action.id)).toMatchObject({ status: 'failed', error: 'Chưa xác nhận — đã gửi lại lệnh' });
    await expect(ex.retryAction(r.action.id)).rejects.toThrow('đã được gửi lại');

    vi.setSystemTime(new Date(NOW.getTime() + 7 * 60_000));
    await ex.verifyPendingActions();
    const r2 = await ex.retryAction(r1.action.id);
    expect(r2.action.retryOf).toBe(r.action.id);
    vi.setSystemTime(new Date(NOW.getTime() + 11 * 60_000));
    await ex.verifyPendingActions();
    await expect(ex.retryAction(r2.action.id)).rejects.toThrow('Đã gửi lại 2 lần');
  });

  it('Gửi lại khi TikTok đã gỡ rồi → không gửi lệnh', async () => {
    const r = await ex.executeProposal(proposal('remove_creative').id);
    vi.setSystemTime(new Date(NOW.getTime() + 3 * 60_000));
    await ex.verifyPendingActions();
    // chưa xác nhận, rồi TikTok gỡ nhưng nền chưa tới lượt đọc
    mock.videoStatus['p1/v1'] = 'EXCLUDED';
    const writes = mock.writes.length;
    await expect(ex.retryAction(r.action.id)).rejects.toThrow('không cần gửi lại');
    expect(mock.writes).toHaveLength(writes);
  });

  it.each([
    ['chiến dịch tắt', () => (mock.info.operation_status = 'DISABLE'), 'Chiến dịch đang tắt'],
    ['không phải AUTO_SELECTION', () => (mock.info.product_video_specific_type = 'CUSTOM_SELECTION'), 'AUTO_SELECTION'],
    ['video đã bị gỡ', () => (mock.videoStatus['p1/v1'] = 'EXCLUDED'), 'đã bị gỡ'],
    ['không tìm thấy video', () => (mock.videoStatus = {}), 'Không tìm thấy video'],
  ])('chặn khi %s — không gửi lệnh, đề xuất vẫn chờ duyệt', async (_n, setup, msg) => {
    setup();
    const p = proposal('remove_creative');
    await expect(ex.executeProposal(p.id)).rejects.toThrow(msg);
    expect(mock.writes).toHaveLength(0);
    expect(mock.runtime.proposals[0].status).toBe('pending');
    expect(mock.runtime.proposals[0].note).toContain('Chưa chạy được');
  });

  it('thêm lại chỉ khi video đang bị gỡ', async () => {
    await expect(ex.executeProposal(proposal('add_creative').id)).rejects.toThrow('không bị gỡ');
    mock.videoStatus['p1/v1'] = 'EXCLUDED';
    await ex.executeProposal(proposal('add_creative').id);
    expect(mock.writes[0].params.action).toBe('ADD');
  });

  it('thêm lại vì gỡ sai (BOT chạy) → Nhật ký ghi reAddOf = lần gỡ, người làm BOT', async () => {
    mock.videoStatus['p1/v1'] = 'EXCLUDED';
    const p = proposal('add_creative', {}, { reAddOf: 'cut-1', ruleMode: 'auto' });
    const r = await ex.executeProposal(p.id, ex.BOT_ACTOR, 'agent');
    expect(mock.writes[0].params.action).toBe('ADD');
    expect(r.action).toMatchObject({ actionType: 'add_creative', actor: 'agent', reAddOf: 'cut-1', proposalId: p.id });
  });

  it('TikTok báo lỗi → nhật ký Lỗi, không thử lại', async () => {
    mock.writeError = new Error('TikTok trả lỗi 40002: invalid');
    const r = await ex.executeProposal(proposal('remove_creative').id);
    expect(r.action.status).toBe('failed');
    expect(r.action.error).toContain('40002');
    expect(mock.writes).toHaveLength(1);
  });

  it('TikTok không trả lời (quá giờ) → không báo lỗi ngay, đọc trạng thái video (TikTok có thể đã gỡ) — 28/11', async () => {
    const { TikTokTimeoutError } = await import('../server/tiktok/mcpClient');
    mock.writeError = new TikTokTimeoutError(90);
    const r = await ex.executeProposal(proposal('remove_creative').id);
    expect(r.action.status).toBe('running');
    expect(r.action.note).toMatch(/chưa trả lời/);
    expect(mock.writes).toHaveLength(1);
    // Thực ra TikTok đã gỡ → lần đọc trạng thái chuyển Thành công
    mock.videoStatus['p1/v1'] = 'EXCLUDED';
    expect((await ex.verifyAction(r.action.id)).action.status).toBe('success');
  });

  it('lệnh ngân sách quá giờ → Lỗi kèm nhắc kiểm tra Ads Manager (có thể TikTok đã nhận)', async () => {
    const { TikTokTimeoutError } = await import('../server/tiktok/mcpClient');
    mock.writeError = new TikTokTimeoutError(90);
    const r = await ex.executeProposal(proposal('update_budget', { budgetChangePct: 10 }).id);
    expect(r.action.status).toBe('failed');
    expect(r.action.error).toMatch(/Ads Manager/);
  });
});

describe('Tăng cường (campaign_gmv_max_session_create)', () => {
  it('CREATIVE_NO_BID, store_id, hết hạn sau N ngày (UTC)', async () => {
    const r = await ex.executeProposal(proposal('boost_creative', { boostBudget: 300_000, boostDays: 2 }).id);
    expect(mock.writes[0]).toEqual({
      tool: 'campaign_gmv_max_session_create',
      params: {
        advertiser_id: '7579465349544869906',
        campaign_id: 'c1',
        store_id: '7496093946365052968',
        session: {
          bid_type: 'CREATIVE_NO_BID',
          item_id: 'v1',
          product_list: [{ spu_id: 'p1' }],
          budget: 300_000,
          schedule_type: 'SCHEDULE_START_END',
          schedule_end_time: '2026-11-21 05:00:00',
        },
      },
    });
    expect(r.action.status).toBe('success');
  });

  it('chặn ngân sách < 260k, vượt trần ngày, video cần ủy quyền', async () => {
    await expect(ex.executeProposal(proposal('boost_creative', { boostBudget: 100_000 }).id)).rejects.toThrow('tối thiểu');
    mock.config.guardrails.dailyBoostCap = 500_000;
    await ex.executeProposal(proposal('boost_creative', { boostBudget: 300_000 }).id);
    await expect(ex.executeProposal(proposal('boost_creative', { boostBudget: 300_000 }).id)).rejects.toThrow('trần tăng cường');
    mock.config.guardrails.dailyBoostCap = 10_000_000;
    mock.videoStatus['p1/v1'] = 'AUTHORIZATION_NEEDED';
    await expect(ex.executeProposal(proposal('boost_creative', { boostBudget: 300_000 }).id)).rejects.toThrow('không cho tăng cường');
    expect(mock.writes).toHaveLength(1);
  });

  it('không hoàn tác được', async () => {
    const r = await ex.executeProposal(proposal('boost_creative', { boostBudget: 300_000 }).id);
    await expect(ex.undoAction(r.action.id)).rejects.toThrow('không hoàn tác');
  });
});

describe('Ngân sách / ROI mục tiêu (campaign_gmv_max_update)', () => {
  it('tính từ ngân sách đọc từ TikTok, kẹp theo giới hạn %, làm tròn 1.000đ', async () => {
    mock.info.budget = 1_234_567;
    const r = await ex.executeProposal(proposal('update_budget', { budgetChangePct: 80 }).id);
    expect(mock.writes[0].params).toEqual({ advertiser_id: '7579465349544869906', campaign_id: 'c1', budget: 1_605_000 });
    expect(r.action.params.prev).toEqual({ budget: 1_234_567 });
    expect(r.action.status).toBe('success');
  });

  it('ROI làm tròn 1 chữ số; chặn khi không phải VO_MIN_ROAS', async () => {
    mock.info.roas_bid = 7.5;
    await ex.executeProposal(proposal('update_roi_target', { roiTargetChangePct: -10 }).id);
    expect(mock.writes[0].params.roas_bid).toBe(6.8);
    mock.info.deep_bid_type = 'MAX_DELIVERY';
    await expect(ex.executeProposal(proposal('update_roi_target', { roiTargetChangePct: -10 }).id)).rejects.toThrow('VO_MIN_ROAS');
  });

  it('chặn khi shop chưa cấp quyền GMV Max độc quyền', async () => {
    mock.exclusive = false;
    await expect(ex.executeProposal(proposal('update_budget', { budgetChangePct: 20 }).id)).rejects.toThrow('độc quyền');
    expect(mock.writes).toHaveLength(0);
  });

  it('đọc lại chưa thấy giá trị mới → vẫn thành công nhưng có ghi chú', async () => {
    mock.applyWrites = false;
    const r = await ex.executeProposal(proposal('update_budget', { budgetChangePct: 20 }).id);
    expect(r.action.status).toBe('success');
    expect(r.message).toContain('chưa thấy giá trị mới');
  });

  it('hoàn tác → đặt lại ngân sách cũ, dòng gốc thành Đã hoàn tác', async () => {
    const r = await ex.executeProposal(proposal('update_budget', { budgetChangePct: 20 }).id);
    const u = await ex.undoAction(r.action.id);
    expect(mock.writes[1].params.budget).toBe(1_000_000);
    expect(u.action).toMatchObject({ undoOf: r.action.id, status: 'success', actionType: 'update_budget' });
    expect(actionOf(r.action.id).status).toBe('undone');
    await expect(ex.undoAction(r.action.id)).rejects.toThrow();
  });
});

describe('Tắt / bật sản phẩm (campaign_gmv_max_update item_group_ids)', () => {
  it('bớt / thêm đúng 1 sản phẩm', async () => {
    await ex.executeProposal(proposal('disable_product').id);
    expect(mock.writes[0].params.item_group_ids).toEqual(['p2']);
    await ex.executeProposal(proposal('enable_product').id);
    expect(mock.writes[1].params.item_group_ids).toEqual(['p2', 'p1']);
  });

  it('chặn khi chiến dịch tự chọn sản phẩm, hoặc tắt sản phẩm duy nhất', async () => {
    mock.info.item_group_ids = ['p1'];
    await expect(ex.executeProposal(proposal('disable_product').id)).rejects.toThrow('duy nhất');
    mock.info.product_specific_type = 'ALL';
    await expect(ex.executeProposal(proposal('disable_product').id)).rejects.toThrow('tự chọn sản phẩm');
    expect(mock.writes).toHaveLength(0);
  });

  it('hoàn tác tắt sản phẩm → bật lại', async () => {
    const r = await ex.executeProposal(proposal('disable_product').id);
    await ex.undoAction(r.action.id);
    expect(mock.writes[1].params.item_group_ids).toEqual(['p2', 'p1']);
  });
});

describe('An toàn', () => {
  it('số liệu mới không còn khớp quy tắc → không gửi lệnh, đề xuất chuyển Không còn khớp', async () => {
    mock.outdatedReason = 'Số liệu 12/11–18/11: chi 1,63 tr · ROI 4,76 — không còn khớp quy tắc «Gỡ video lỗ»';
    const p = proposal('remove_creative');
    await expect(ex.executeProposal(p.id)).rejects.toThrow('không còn khớp');
    expect(mock.writes).toHaveLength(0);
    expect(mock.runtime.proposals[0]).toMatchObject({ status: 'outdated', note: mock.outdatedReason });
  });

  it('đề xuất hết hạn / đã duyệt / nhắc việc → không chạy', async () => {
    const old = proposal('remove_creative', {}, { expiresAt: new Date(NOW.getTime() - 1000).toISOString() });
    await expect(ex.executeProposal(old.id)).rejects.toThrow('hết hạn');
    const done = proposal('remove_creative', {}, { status: 'approved', actionId: 'a-old' });
    await expect(ex.executeProposal(done.id)).rejects.toThrow('không còn chờ');
    await expect(ex.executeProposal(proposal('remind').id)).rejects.toThrow('Nhắc việc');
    expect(mock.writes).toHaveLength(0);
  });

  it('đề xuất duyệt trước khi bật thực thi (chưa có actionId) → chạy được; đã chạy rồi thì không chạy lại', async () => {
    const old = proposal('remove_creative', {}, {
      status: 'approved',
      expiresAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
    });
    const r = await ex.executeProposal(old.id);
    expect(mock.runtime.proposals.find((p) => p.id === old.id)?.actionId).toBe(r.action.id);
    await expect(ex.executeProposal(old.id)).rejects.toThrow('không còn chờ');
    expect(mock.writes).toHaveLength(1);
  });

  it('bấm Duyệt 2 lần cùng lúc → chỉ 1 lệnh', async () => {
    const p = proposal('update_budget', { budgetChangePct: 20 });
    const results = await Promise.allSettled([ex.executeProposal(p.id), ex.executeProposal(p.id)]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(mock.writes).toHaveLength(1);
  });

  it('đủ số thao tác tối đa hôm nay → không chạy', async () => {
    mock.config.guardrails.maxActionsPerDay = 1;
    await ex.executeProposal(proposal('update_budget', { budgetChangePct: 20 }).id);
    await expect(ex.executeProposal(proposal('update_budget', { budgetChangePct: 10 }).id)).rejects.toThrow('thao tác hôm nay');
    expect(mock.writes).toHaveLength(1);
  });
});

describe('Thao tác thủ công từ bảng Video (executeManual)', () => {
  const target = { campaignId: 'c1', productId: 'p1', videoId: 'v1' };

  it('Gỡ: gửi đúng tham số, nhật ký Thủ công không theo quy tắc, số liệu lúc quyết định từ snapshot', async () => {
    mock.snapshot = snapshot({
      videos: [
        video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 200_000 }),
        video({ id: 'v1', campaignId: 'c1', productId: 'p2', cost: 50_000 }),
      ],
    });
    const r = await ex.executeManual({ actionType: 'remove_creative', target });
    expect(mock.writes).toEqual([
      {
        tool: 'gmv_max_creative_update',
        params: { advertiser_id: '7579465349544869906', campaign_id: 'c1', action: 'REMOVE', item_list: [{ item_id: 'v1', spu_id_list: ['p1', 'p2'] }] },
      },
    ]);
    expect(r.action).toMatchObject({ actor: 'manual', ruleId: null, actionType: 'remove_creative', status: 'running' });
    expect(r.action.before.cost).toBe(250_000); // cộng các dòng theo sản phẩm
  });

  it('Tăng cường: dưới 260k / quá 7 ngày / vượt trần → không gửi lệnh', async () => {
    await expect(ex.executeManual({ actionType: 'boost_creative', target, params: { boostBudget: 100_000, boostDays: 1 } })).rejects.toThrow('tối thiểu');
    await expect(ex.executeManual({ actionType: 'boost_creative', target, params: { boostBudget: 300_000, boostDays: 9 } })).rejects.toThrow('Số ngày');
    mock.config.guardrails.dailyBoostCap = 200_000;
    await expect(ex.executeManual({ actionType: 'boost_creative', target, params: { boostBudget: 300_000, boostDays: 1 } })).rejects.toThrow('Vượt trần');
    expect(mock.writes).toHaveLength(0);
  });

  it('Bật lại sản phẩm (bảng Sản phẩm): không cần video, thêm đúng 1 sản phẩm vào item_group_ids, hoàn tác = tắt lại', async () => {
    mock.info.item_group_ids = ['p2'];
    const r = await ex.executeManual({ actionType: 'enable_product', target: { campaignId: 'c1', productId: 'p1', videoId: '' } });
    expect(mock.writes).toHaveLength(1);
    expect(mock.writes[0].tool).toBe('campaign_gmv_max_update');
    expect(mock.writes[0].params.item_group_ids).toEqual(['p2', 'p1']);
    expect(r.action).toMatchObject({ actor: 'manual', ruleId: null, actionType: 'enable_product', target: { productId: 'p1', videoId: '' } });
    await ex.undoAction(r.action.id);
    expect(mock.info.item_group_ids).toEqual(['p2']);
  });

  it('Bật lại: sản phẩm đang bật / chiến dịch tự chọn sản phẩm → không gửi lệnh', async () => {
    await expect(ex.executeManual({ actionType: 'enable_product', target: { campaignId: 'c1', productId: 'p1', videoId: '' } })).rejects.toThrow();
    mock.info.item_group_ids = ['p2'];
    mock.info.product_specific_type = 'ALL';
    await expect(ex.executeManual({ actionType: 'enable_product', target: { campaignId: 'c1', productId: 'p1', videoId: '' } })).rejects.toThrow();
    expect(mock.writes).toHaveLength(0);
  });

  it('chỉ nhận Gỡ / Thêm lại / Tăng cường; thiếu đối tượng → từ chối', async () => {
    await expect(ex.executeManual({ actionType: 'update_budget', target, params: { budgetChangePct: 50 } })).rejects.toThrow('không làm thủ công');
    await expect(ex.executeManual({ actionType: 'disable_product', target })).rejects.toThrow('không làm thủ công');
    await expect(ex.executeManual({ actionType: 'remove_creative', target: { campaignId: 'c1', productId: '', videoId: '' } })).rejects.toThrow('Thiếu');
    expect(mock.writes).toHaveLength(0);
  });

  it('thao tác thủ công hoàn tác được', async () => {
    mock.applyCreative = true;
    const r = await ex.executeManual({ actionType: 'remove_creative', target });
    await ex.followUpCreative(r.action.id);
    expect(actionOf(r.action.id).status).toBe('success');
    const u = await ex.undoAction(r.action.id);
    expect(mock.writes.at(-1)?.params.action).toBe('ADD');
    expect(u.action).toMatchObject({ actor: 'manual', undoOf: r.action.id });
  });
});

describe('BOT chạy (runAutoProposals — quy tắc chế độ "BOT chạy")', () => {
  const autoRule = (mode: 'auto' | 'approve' = 'auto') => ({ id: 'r1', mode } as AgentConfig['rules'][number]);

  it('thực thi ngay, nhật ký ghi BOT tự chạy', async () => {
    mock.config.rules = [autoRule()];
    const p = proposal('update_budget', { budgetChangePct: 20 });
    expect(await ex.runAutoProposals([p.id])).toEqual({ ran: 1, failed: 0 });
    expect(mock.writes).toHaveLength(1);
    expect(mock.runtime.actions[0]).toMatchObject({ actor: 'agent', by: ex.BOT_ACTOR, proposalId: p.id });
    expect(mock.runtime.proposals[0].status).toBe('approved');
  });

  it('vượt giới hạn an toàn → không gửi lệnh, đề xuất nằm lại Chờ duyệt kèm lý do', async () => {
    mock.config.rules = [autoRule()];
    mock.config.guardrails.maxActionsPerDay = 1;
    await ex.executeProposal(proposal('update_budget', { budgetChangePct: 10 }).id);
    const p = proposal('update_budget', { budgetChangePct: 20 });
    expect(await ex.runAutoProposals([p.id])).toEqual({ ran: 0, failed: 1 });
    expect(mock.writes).toHaveLength(1);
    const x = mock.runtime.proposals.find((y) => y.id === p.id)!;
    expect(x.status).toBe('pending');
    expect(x.note).toMatch(/^BOT chưa chạy được: .*thao tác hôm nay.* — chờ Sếp duyệt$/);
    // Sang ngày mới (giới hạn tính lại) → lượt quét đưa đề xuất cũ vào lại → BOT chạy được (lỗi hosting 27/11)
    vi.setSystemTime(new Date(NOW.getTime() + 13 * 3_600_000)); // 01:00 giờ VN hôm sau, đề xuất còn hạn
    expect(await ex.runAutoProposals([p.id])).toEqual({ ran: 1, failed: 0 });
    expect(mock.writes).toHaveLength(2);
    expect(mock.runtime.proposals.find((y) => y.id === p.id)!.status).toBe('approved');
  });

  it('quy tắc đã đổi về Cần duyệt / BOT tạm dừng → không tự chạy', async () => {
    mock.config.rules = [autoRule('approve')];
    const p = proposal('update_budget', { budgetChangePct: 20 });
    expect(await ex.runAutoProposals([p.id])).toEqual({ ran: 0, failed: 0 });
    mock.config.rules = [autoRule()];
    mock.config.paused = true;
    expect(await ex.runAutoProposals([p.id])).toEqual({ ran: 0, failed: 0 });
    expect(mock.writes).toHaveLength(0);
    expect(mock.runtime.proposals[0].status).toBe('pending');
  });
});
