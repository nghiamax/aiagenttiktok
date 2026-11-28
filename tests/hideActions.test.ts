import { describe, expect, it, vi } from 'vitest';
import type { AgentActionLog, AgentRuntime } from '../shared/agentTypes';
import { evaluateAction } from '../src/pages/ads/agent/evaluate';

/* Xoá dòng Nhật ký (Sếp yêu cầu 28/11): chỉ ẩn, không xoá dòng đang chờ TikTok, Hiệu quả không tính dòng đã xoá */
const mock = vi.hoisted(() => ({ runtime: { actions: [] as AgentActionLog[] } as unknown as AgentRuntime }));
vi.mock('../server/store', () => ({
  getRuntime: () => mock.runtime,
  updateRuntime: (fn: (r: AgentRuntime) => AgentRuntime | void) => {
    fn(mock.runtime);
    return mock.runtime;
  },
}));
const { hideActionLogs } = await import('../server/agent/hideActions');

const log = (id: string, over: Partial<AgentActionLog> = {}): AgentActionLog => ({
  id,
  executedAt: '2026-11-20T03:00:00Z',
  actor: 'approved',
  ruleId: 'r1',
  actionType: 'remove_creative',
  target: { campaignId: 'c1', productId: 'p1', videoId: 'v1' },
  params: {},
  before: { from: '2026-11-13T00:00:00+07:00', to: '2026-11-19T23:59:59+07:00', cost: 700_000, revenue: 840_000, orders: 2, roi: 1.2, breakEven: 4.5 },
  after: { from: '2026-11-21T00:00:00+07:00', to: '2026-11-21T23:59:59+07:00', cost: 0, revenue: 0, orders: 0, roi: null, breakEven: 4.5 },
  status: 'success',
  ...over,
});

describe('Xoá dòng Nhật ký', () => {
  it('chỉ ẩn dòng được chọn (vẫn còn trong dữ liệu), bỏ qua dòng đang chờ TikTok và dòng đã xoá', () => {
    mock.runtime.actions = [log('a'), log('b', { status: 'running' }), log('c'), log('d', { hidden: { at: '2026-11-21T00:00:00Z' } })];
    const r = hideActionLogs(['a', 'b', 'd', 'x'], { id: 'u1', name: 'Sếp' });
    expect(r).toEqual({ hidden: 1, skippedRunning: 1 });
    const by = Object.fromEntries(mock.runtime.actions.map((a) => [a.id, a]));
    expect(mock.runtime.actions).toHaveLength(4);
    expect(by.a.hidden?.by?.name).toBe('Sếp');
    expect(by.b.hidden).toBeUndefined();
    expect(by.c.hidden).toBeUndefined();
    expect(by.d.hidden?.at).toBe('2026-11-21T00:00:00Z');
  });

  it('Hiệu quả không chấm dòng đã xoá', () => {
    const now = Date.parse('2026-11-23T00:00:00Z');
    expect(evaluateAction(log('a'), 24, now).verdict).toBe('good');
    expect(evaluateAction(log('a', { hidden: { at: '2026-11-22T00:00:00Z' } }), 24, now).verdict).toBe('excluded');
  });
});
