import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contentHasCode, extendProUntil, newOrderCode, vietQrUrl } from '../shared/billing';
import { effectivePlan } from '../shared/plans';

/* Mua Pro bằng chuyển khoản: mã đơn, cộng hạn, webhook SePay — dữ liệu ở thư mục tạm */
const dir = vi.hoisted(() => ({ path: '' }));
vi.mock('../server/config', async () => {
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  dir.path = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'billing-'));
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
const store = await import('../server/billing/store');
const { billingWebhook, billingRouter } = await import('../server/routes/billing');

const DAY = 86_400_000;

function setup() {
  store.saveBillingConfig({
    bankBin: '970436',
    accountNo: '0123456789',
    accountName: 'Nguyễn Văn Á',
    options: [
      { months: 1, price: 99000 },
      { months: 12, price: 990000 },
    ],
    webhookKey: 'khoa-bi-mat',
  });
  return users.createUser({ username: 'khach', role: 'user', password: 'matkhau123' });
}

function webhook(body: unknown, auth = 'Apikey khoa-bi-mat') {
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
  const req = { body, get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : undefined) } as unknown as Request;
  billingWebhook(req, res as unknown as Response);
  return res as { statusCode: number; body: Record<string, unknown> };
}

beforeEach(() => {
  db.clearAllForTests();
  for (const f of ['billing.json', 'billing-orders.json']) fs.rmSync(path.join(dir.path, f), { force: true });
});

describe('Mã đơn + hạn Pro', () => {
  it('mã SA + 8 ký tự; nhận ra trong nội dung ngân hàng thêm chữ / dấu cách / chữ thường', () => {
    const code = newOrderCode();
    expect(code).toMatch(/^SA[A-Z2-9]{8}$/);
    expect(contentHasCode(`MBVCB.123456.${code.toLowerCase()}.CT tu 0123`, code)).toBe(true);
    expect(contentHasCode(`${code.slice(0, 5)} ${code.slice(5)}`, code)).toBe(true);
    expect(contentHasCode('chuyen tien', code)).toBe(false);
  });

  it('đang Pro thì cộng nối tiếp; hết hạn / Miễn phí tính từ bây giờ; Pro không hạn giữ nguyên', () => {
    const now = Date.parse('2026-11-22T00:00:00Z');
    expect(extendProUntil({ plan: 'free' }, 1, now)).toBe(new Date(now + 30 * DAY).toISOString());
    const active = new Date(now + 10 * DAY).toISOString();
    expect(extendProUntil({ plan: 'pro', proUntil: active }, 1, now)).toBe(new Date(now + 40 * DAY).toISOString());
    expect(extendProUntil({ plan: 'pro', proUntil: '2026-01-01T00:00:00Z' }, 1, now)).toBe(new Date(now + 30 * DAY).toISOString());
    expect(extendProUntil({ plan: 'pro', proUntil: null }, 1, now)).toBeNull();
  });

  it('QR VietQR có số tiền + nội dung', () => {
    const u = vietQrUrl({ bankBin: '970436', accountNo: '0123', accountName: 'NGUYEN VAN A' }, 99000, 'SAABCDEFGH');
    expect(u).toContain('img.vietqr.io/image/970436-0123-compact2.png');
    expect(u).toContain('amount=99000');
    expect(u).toContain('addInfo=SAABCDEFGH');
  });
});

describe('Đơn + webhook SePay', () => {
  it('chưa nhập ngân hàng / giá → chưa bán; Quản trị viên không mua', () => {
    const u = users.createUser({ username: 'khach', role: 'user', password: 'matkhau123' });
    expect(() => store.createOrder(u.id, 1)).toThrow(/Chưa mở bán/);
    const admin = users.createUser({ username: 'sep', password: 'matkhau123' });
    expect(() => store.createOrder(admin.id, 1)).toThrow(/Quản trị viên/);
  });

  it('chuyển khoản đúng nội dung + đủ tiền → tự lên Pro 30 ngày; gửi lại không cộng 2 lần', () => {
    const u = setup();
    expect(store.publicBilling().accountName).toBe('NGUYEN VAN A');
    const order = store.createOrder(u.id, 1);
    expect(order.amount).toBe(99000);
    // Đơn đang chờ cùng thời hạn → dùng lại
    expect(store.createOrder(u.id, 1).id).toBe(order.id);

    const tx = { id: 9001, transferType: 'in', transferAmount: 99000, content: `IBFT ${order.code} chuyen tien` };
    const r = webhook(tx);
    expect(r.body).toMatchObject({ success: true, result: 'activated' });
    const after = users.findUserById(u.id)!;
    expect(effectivePlan(users.publicUser(after))).toBe('pro');
    expect(Date.parse(after.proUntil!) - Date.now()).toBeGreaterThan(29 * DAY);
    expect(store.findOrder(order.id)).toMatchObject({ status: 'paid', paidBy: 'webhook', txId: '9001' });

    expect(webhook(tx).body.result).toBe('duplicate');
    expect(users.findUserById(u.id)!.proUntil).toBe(after.proUntil);
  });

  it('thiếu tiền / sai nội dung / tiền ra → không lên Pro, ghi "chưa khớp"; sai khoá → 401', () => {
    const u = setup();
    const order = store.createOrder(u.id, 12);
    expect(webhook({ id: 1, transferType: 'in', transferAmount: 99000, content: order.code }).body.result).toBe('unmatched');
    expect(webhook({ id: 2, transferType: 'in', transferAmount: 990000, content: 'khong co ma' }).body.result).toBe('unmatched');
    expect(webhook({ id: 3, transferType: 'out', transferAmount: 990000, content: order.code }).body.result).toBe('ignored');
    expect(webhook({ id: 4, transferType: 'in', transferAmount: 990000, content: order.code }, 'Apikey sai').statusCode).toBe(401);
    expect(effectivePlan(users.publicUser(users.findUserById(u.id)!))).toBe('free');
    expect(store.listOrders().unmatched).toHaveLength(2);
    // Đơn đã huỷ mà khách vẫn chuyển → vẫn nhận
    store.cancelOrder(order.id, u.id);
    expect(webhook({ id: 5, transferType: 'in', transferAmount: 990000, content: order.code }).body.result).toBe('activated');
  });

  it('chưa đặt khoá webhook → 503; Quản trị viên xác nhận tay → lên Pro', () => {
    const u = setup();
    store.saveBillingConfig({ webhookKey: '' });
    expect(webhook({ id: 1 }, 'Apikey ').statusCode).toBe(503);
    const order = store.createOrder(u.id, 1);
    store.markPaidManually(order.id);
    expect(store.findOrder(order.id)).toMatchObject({ status: 'paid', paidBy: 'manual' });
    expect(effectivePlan(users.publicUser(users.findUserById(u.id)!))).toBe('pro');
  });

  it('route quản trị cần manage_users; route mua cần finance', () => {
    const perms = (billingRouter.stack as { route?: { path: string; stack: { handle: { permission?: string } }[] } }[])
      .filter((l) => l.route)
      .map((l) => [l.route!.path, l.route!.stack.map((s) => s.handle.permission).find(Boolean)]);
    for (const [p, perm] of perms) expect(perm, p).toBe(p!.startsWith('/admin') ? 'manage_users' : 'finance');
  });
});

process.on('exit', () => db.closeDb());
process.on('exit', () => fs.rmSync(dir.path, { recursive: true, force: true }));
