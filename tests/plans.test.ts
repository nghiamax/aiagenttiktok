import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectivePlan, FREE_PRICING_CALCS, FREE_PROFIT_ORDERS, grantOrders, quotaOf } from '../shared/plans';
import { can } from '../shared/permissions';

/* Gói Miễn phí / Pro + đếm lượt Tính giá bán — dữ liệu ở thư mục tạm */
const dir = vi.hoisted(() => ({ path: '' }));
vi.mock('../server/config', async () => {
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  dir.path = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'plans-'));
  return {
    config: {
      dataDir: dir.path,
      secretsDir: dir.path,
      cookieSecure: false,
      root: process.cwd(),
      allowedOrigins: [],
      tiktok: { mcpUrl: 'https://example.invalid/mcp', advertiserId: 'adv', storeId: 'store', advertiserName: 'shop', currency: 'VND' },
    },
  };
});

const db = await import('../server/db/index');
const users = await import('../server/auth/users');
const usage = await import('../server/finance/usage');
const costs = await import('../server/finance/costs');
const { financeRouter } = await import('../server/routes/finance');
const { usersRouter } = await import('../server/routes/users');

type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: (req: Request, res: Response, next: () => void) => void }[] } };

/** Gọi handler cuối của route (bỏ qua middleware quyền — đã test ở auth.test) */
function call(router: { stack: unknown[] }, method: string, routePath: string, req: Partial<Request>) {
  const layer = (router.stack as Layer[]).find((l) => l.route?.path === routePath && l.route.methods[method]);
  if (!layer) throw new Error(`Không có route ${method} ${routePath}`);
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(c: number) {
      res.statusCode = c;
      return res;
    },
    json(b: unknown) {
      res.body = b;
      return res;
    },
  };
  const stack = layer.route!.stack;
  stack[stack.length - 1].handle({ params: {}, body: {}, ...req } as Request, res as unknown as Response, () => undefined);
  return res as { statusCode: number; body: Record<string, unknown> };
}

beforeEach(() => {
  db.clearAllForTests();
  for (const f of ['usage.json', 'costs.json']) fs.rmSync(path.join(dir.path, f), { force: true });
});

describe('Gói', () => {
  const now = Date.parse('2026-11-22T00:00:00Z');
  it('Chủ shop luôn Pro; Pro hết hạn → Miễn phí; Pro không hạn', () => {
    expect(effectivePlan({ role: 'owner' }, now)).toBe('pro');
    expect(effectivePlan({ role: 'user' }, now)).toBe('free');
    expect(effectivePlan({ role: 'user', plan: 'pro', proUntil: null }, now)).toBe('pro');
    expect(effectivePlan({ role: 'user', plan: 'pro', proUntil: '2026-12-01T00:00:00Z' }, now)).toBe('pro');
    expect(effectivePlan({ role: 'user', plan: 'pro', proUntil: '2026-11-01T00:00:00Z' }, now)).toBe('free');
  });

  it('Miễn phí: 100 lượt, không có Tính hàng loạt; Pro: không giới hạn + hàng loạt', () => {
    expect(quotaOf({ role: 'user' }, 30, now)).toMatchObject({ unlimited: false, limit: FREE_PRICING_CALCS, remaining: 70, bulk: false });
    expect(quotaOf({ role: 'user' }, 150, now).remaining).toBe(0);
    expect(quotaOf({ role: 'user', plan: 'pro' }, 500, now)).toMatchObject({ unlimited: true, remaining: null, bulk: true, profitLimit: null });
    expect(quotaOf({ role: 'user' }, 0, now, 40)).toMatchObject({ profitUsed: 40, profitLimit: FREE_PROFIT_ORDERS, profitRemaining: 60 });
  });

  it('Người dùng (chủ tài khoản khách): dùng mọi mục trên shop của mình, không quản lý tài khoản', () => {
    expect(can('user', 'finance')).toBe(true);
    expect(can('user', 'view')).toBe(true);
    expect(can('user', 'execute')).toBe(true);
    expect(can('user', 'manage_users')).toBe(false);
  });
});

describe('Đếm lượt Tính giá bán (server)', () => {
  it('Miễn phí: trừ từng lượt, hết 100 lượt → 402 QUOTA_EXCEEDED, không đếm thêm', () => {
    const u = users.createUser({ username: 'khach', role: 'user', password: 'matkhau123' });
    const req = { user: users.publicUser(u) };
    const first = call(financeRouter, 'post', '/calc', req);
    expect(first.statusCode).toBe(200);
    expect(first.body.quota).toMatchObject({ used: 1, remaining: FREE_PRICING_CALCS - 1 });
    for (let i = 1; i < FREE_PRICING_CALCS; i++) usage.addPricingCalc(u.id);
    const over = call(financeRouter, 'post', '/calc', req);
    expect(over.statusCode).toBe(402);
    expect(over.body.code).toBe('QUOTA_EXCEEDED');
    expect(usage.pricingUsed(u.id)).toBe(FREE_PRICING_CALCS);
  });

  it('Pro: không đếm, không chặn', () => {
    const u = users.createUser({ username: 'pro1', role: 'user', plan: 'pro', password: 'matkhau123' });
    const r = call(financeRouter, 'post', '/calc', { user: users.publicUser(u) });
    expect(r.statusCode).toBe(200);
    expect(r.body.quota).toMatchObject({ unlimited: true, bulk: true });
    expect(usage.pricingUsed(u.id)).toBe(0);
  });
});

describe('Trang Tài khoản (API)', () => {
  it('tạo người dùng mặc định gói Miễn phí; nâng Pro có hạn; đặt lại lượt', () => {
    const owner = users.createUser({ username: 'sep', password: 'matkhau123' });
    const req = { user: users.publicUser(owner) };
    const created = call(usersRouter, 'post', '/', { ...req, body: { username: 'Khach01', name: 'Khách', password: 'matkhau123' } });
    expect(created.statusCode).toBe(200);
    const nu = created.body.user as { id: string; role: string; activePlan: string };
    expect(nu).toMatchObject({ role: 'user', activePlan: 'free' });

    const up = call(usersRouter, 'patch', '/:id', { ...req, params: { id: nu.id }, body: { plan: 'pro', proDays: 30 } });
    const upUser = up.body.user as { activePlan: string; proUntil: string };
    expect(upUser.activePlan).toBe('pro');
    expect(Date.parse(upUser.proUntil) - Date.now()).toBeGreaterThan(29 * 86_400_000);

    usage.addPricingCalc(nu.id);
    call(usersRouter, 'post', '/:id/reset-usage', { ...req, params: { id: nu.id } });
    expect(usage.pricingUsed(nu.id)).toBe(0);
  });

  it('không tự khoá / tự đổi vai trò; giữ ít nhất 1 Chủ shop', () => {
    const owner = users.createUser({ username: 'sep', password: 'matkhau123' });
    const req = { user: users.publicUser(owner) };
    expect(call(usersRouter, 'patch', '/:id', { ...req, params: { id: owner.id }, body: { disabled: true } }).statusCode).toBe(400);
    expect(call(usersRouter, 'patch', '/:id', { ...req, params: { id: owner.id }, body: { role: 'user' } }).statusCode).toBe(400);
    const other = users.createUser({ username: 'sep2', role: 'owner', password: 'matkhau123' });
    // Khoá chủ shop khác được (vẫn còn mình)
    expect(call(usersRouter, 'patch', '/:id', { ...req, params: { id: other.id }, body: { disabled: true } }).statusCode).toBe(200);
    // Xoá: không tự xoá mình; xoá người khác → mất tài khoản + số lượt
    expect(call(usersRouter, 'delete', '/:id', { ...req, params: { id: owner.id } }).statusCode).toBe(400);
    const khach = users.createUser({ username: 'khach9', role: 'user', password: 'matkhau123' });
    usage.addPricingCalc(khach.id);
    expect(call(usersRouter, 'delete', '/:id', { ...req, params: { id: khach.id } }).statusCode).toBe(200);
    expect(users.findUserById(khach.id)).toBeNull();
    expect(usage.pricingUsed(khach.id)).toBe(0);
  });
});

describe('Tính lợi nhuận: gói Miễn phí 100 đơn', () => {
  it('đơn đã đếm luôn được tính lại; đơn mới tới khi đủ giới hạn; trùng mã không đếm 2 lần', () => {
    const r1 = grantOrders([], ['A', 'B', 'B', 'C'], 3);
    expect(r1).toEqual({ allowed: ['A', 'B', 'C'], counted: ['A', 'B', 'C'] });
    const r2 = grantOrders(r1.counted, ['A', 'D'], 3);
    expect(r2).toEqual({ allowed: ['A'], counted: ['A', 'B', 'C'] });
  });

  it('API: Miễn phí tải 150 đơn → 100 đơn được tính; tải lại cùng file không trừ thêm; Pro tính hết', () => {
    const u = users.createUser({ username: 'khachp', role: 'user', password: 'matkhau123' });
    const ids = Array.from({ length: 150 }, (_, i) => `ORD${i}`);
    const send = (user: typeof u, orderIds: string[]) =>
      call(financeRouter, 'post', '/profit-orders', { user: users.publicUser(user), body: { orderIds } }).body as {
        allowed: string[] | null;
        quota: { profitUsed: number; profitRemaining: number };
      };
    const first = send(u, ids.slice(0, 30));
    expect(first.allowed).toHaveLength(30);
    expect(first.quota.profitUsed).toBe(30);
    const again = send(u, ids.slice(0, 30));
    expect(again.quota.profitUsed).toBe(30);
    const all = send(u, ids);
    expect(all.allowed).toHaveLength(FREE_PROFIT_ORDERS);
    expect(all.quota.profitRemaining).toBe(0);
    const pro = users.createUser({ username: 'prop', role: 'user', plan: 'pro', password: 'matkhau123' });
    expect(send(pro, ids).allowed).toBeNull();
  });
});

describe('Nhớ giá vốn theo SKU (theo tài khoản)', () => {
  it('lần sau tải file vẫn còn giá vốn; sửa được; 0 = xoá; mỗi tài khoản riêng', () => {
    const a = users.createUser({ username: 'khacha', role: 'user', plan: 'pro', password: 'matkhau123' });
    const b = users.createUser({ username: 'khachb', role: 'user', plan: 'pro', password: 'matkhau123' });
    const put = (u: typeof a, body: unknown) => call(financeRouter, 'put', '/costs', { user: users.publicUser(u), body });
    const get = (u: typeof a) => call(financeRouter, 'get', '/costs', { user: users.publicUser(u) }).body.costs as import('../server/finance/costs').CostBook;
    expect(put(a, { platform: 'tiktok', costs: { 'SKU-A': 100000 } }).statusCode).toBe(200);
    put(a, { platform: 'tiktok', costs: { 'SKU-B': 50000 } });
    expect(get(a).tiktok).toEqual({ 'SKU-A': 100000, 'SKU-B': 50000 });
    put(a, { platform: 'tiktok', costs: { 'SKU-A': 120000, 'SKU-B': 0 } });
    expect(get(a).tiktok).toEqual({ 'SKU-A': 120000 });
    expect(get(b).tiktok).toEqual({});
    expect(put(a, { platform: 'lazada', costs: {} }).statusCode).toBe(400);
    costs.deleteCosts(a.id);
    expect(get(a).tiktok).toEqual({});
    // Gói Miễn phí không nhớ giá vốn: không lưu được, đọc ra trống
    const f = users.createUser({ username: 'khachf', role: 'user', password: 'matkhau123' });
    expect(put(f, { platform: 'tiktok', costs: { 'SKU-A': 100000 } }).statusCode).toBe(402);
    expect(get(f).tiktok).toEqual({});
  });
});

process.on('exit', () => db.closeDb());
process.on('exit', () => fs.rmSync(dir.path, { recursive: true, force: true }));
