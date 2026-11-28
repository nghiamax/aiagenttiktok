import { describe, expect, it, vi } from 'vitest';
import type { AgentRuntime } from '../shared/agentTypes';

/*
 * Lỗi 28/11 (localhost): lượt quét treo nằm mãi trong `running` → Quét ngay / quét theo giờ dùng lại lượt treo.
 * Nay quá giờ → lượt báo lỗi, ghi lastRunError, lượt sau chạy lại được. Không gọi TikTok, không đụng database.
 */
const mock = vi.hoisted(() => ({
  runtime: { lastRunAt: null, lastRunError: null, proposals: [], actions: [] } as unknown as AgentRuntime,
  hang: true,
  calls: 0,
}));

vi.mock('../server/store', () => ({
  updateRuntime: (fn: (r: AgentRuntime) => void) => {
    fn(mock.runtime);
    return mock.runtime;
  },
}));
vi.mock('../server/shopContext', () => ({ maybeShopId: () => 'shop-test', withShop: (_: string, fn: () => unknown) => fn() }));
vi.mock('../server/shops', () => ({ shopsWithTikTok: () => [] }));
vi.mock('../server/agent/leaderLock', () => ({ holdSchedulerLock: () => true, releaseSchedulerLock: () => undefined }));
vi.mock('../server/agent/engine', () => ({
  runAgent: () => {
    mock.calls++;
    if (mock.hang) return new Promise(() => undefined); // TikTok không bao giờ trả lời
    return Promise.resolve({ ranAt: '', proposals: 0, reminders: 0, expired: 0, outdated: 0, skippedTargets: {}, autoIds: [] });
  },
}));
vi.mock('../server/agent/executor', () => ({ runAutoProposals: async () => ({ ran: 0, failed: 0 }), verifyPendingActions: async () => 0 }));
vi.mock('../server/agent/afterMetrics', () => ({ fillAfterMetrics: async () => 0 }));

const sched = await import('../server/agent/scheduler');

describe('Lượt quét có giới hạn thời gian', () => {
  it('lượt treo → quá giờ báo lỗi, nhả lượt; Quét ngay sau đó chạy lượt mới', async () => {
    sched.runTiming.timeoutMs = 30;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(sched.runAgentOnce('schedule')).rejects.toThrow(/Lượt quét quá/);
    expect(mock.runtime.lastRunError).toMatch(/Lượt quét quá/);
    expect(sched.isAgentRunning()).toBe(false);
    mock.hang = false;
    await expect(sched.runAgentOnce('manual')).resolves.toMatchObject({ proposals: 0 });
    expect(mock.calls).toBe(2);
  });
});
