import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  contentHasCode,
  extendProUntil,
  monthsLabel,
  newOrderCode,
  parseDuration,
  proOptionsError,
  vietQrUrl,
} from '../shared/billing';
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
      tiktok: {
        mcpUrl: 'https://example.invalid/mcp',
        advertiserId: 'adv',
        storeId: 'store',
        advertiserName: 'shop',
        currency: 'VND',
      },
    },
  };
});

const db = await import('../server/db/index');
const users = await import('../server/auth/users');
const store = await import('../server/billing/store');
const { gatewayWebhook, billingRouter } = await import('../server/routes/billing');
const payos = await import('../server/billing/gateways/payosApi');
const { GATEWAY_IMPLS } = await import('../server/billing/gateways/index');
const { GATEWAYS } = await import('../shared/billing');

/** Gọi webhook chung /api/billing/webhook/<cổng> */
function callHook(gateway: string, body: unknown, headers: Record<string, string> = {}) {
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
  const req = {
    params: { gateway },
    body,
    get: (h: string) => headers[h.toLowerCase()],
  } as unknown as Request;
  gatewayWebhook(req, res as unknown as Response);
  return res as { statusCode: number; body: Record<string, unknown> };
}

const DAY = 86_400_000;

function setup() {
  store.saveBillingConfig({
    provider: 'sepay',
    options: [
      { months: 1, price: 99000 },
      { months: 12, price: 990000 },
    ],
    gateways: {
      sepay: { bankBin: '970436', accountNo: '0123456789', accountName: 'Nguyễn Văn Á', webhookKey: 'khoa-bi-mat' },
    },
  });
  return users.createUser({ username: 'khach', role: 'user', password: 'matkhau123' });
}

function webhook(body: unknown, auth = 'Apikey khoa-bi-mat') {
  return callHook('sepay', body, { authorization: auth });
}

beforeEach(() => {
  db.clearAllForTests();
  for (const f of ['billing.json', 'billing-orders.json']) fs.rmSync(path.join(dir.path, f), { force: true });
});

describe('Mã đơn + hạn Pro', () => {
  it('mã SA + 7 ký tự (9 ký tự — payOS giới hạn 9); nhận ra trong nội dung ngân hàng thêm chữ / dấu cách / chữ thường', () => {
    const code = newOrderCode();
    expect(code).toMatch(/^SA[A-Z2-9]{7}$/);
    expect(contentHasCode(`MBVCB.123456.${code.toLowerCase()}.CT tu 0123`, code)).toBe(true);
    expect(contentHasCode(`${code.slice(0, 5)} ${code.slice(5)}`, code)).toBe(true);
    expect(contentHasCode('chuyen tien', code)).toBe(false);
  });

  it('đang Pro thì cộng nối tiếp; hết hạn / Miễn phí tính từ bây giờ; Pro không hạn giữ nguyên', () => {
    const now = Date.parse('2026-11-22T00:00:00Z');
    expect(extendProUntil({ plan: 'free' }, 1, now)).toBe(new Date(now + 30 * DAY).toISOString());
    const active = new Date(now + 10 * DAY).toISOString();
    expect(extendProUntil({ plan: 'pro', proUntil: active }, 1, now)).toBe(new Date(now + 40 * DAY).toISOString());
    expect(extendProUntil({ plan: 'pro', proUntil: '2026-01-01T00:00:00Z' }, 1, now)).toBe(
      new Date(now + 30 * DAY).toISOString(),
    );
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
  it('chưa nhập ngân hàng / giá → chưa bán; Quản trị viên không mua', async () => {
    const u = users.createUser({ username: 'khach', role: 'user', password: 'matkhau123' });
    await expect(store.createOrder(u.id, 1)).rejects.toThrow(/Chưa mở bán/);
    const admin = users.createUser({ username: 'sep', password: 'matkhau123' });
    await expect(store.createOrder(admin.id, 1)).rejects.toThrow(/Quản trị viên/);
  });

  it('chuyển khoản đúng nội dung + đủ tiền → tự lên Pro 30 ngày; gửi lại không cộng 2 lần', async () => {
    const u = setup();
    expect(store.getBillingConfig().gateways.sepay.accountName).toBe('NGUYEN VAN A');
    const order = await store.createOrder(u.id, 1);
    expect(order.amount).toBe(99000);
    // Đơn đang chờ cùng thời hạn → dùng lại
    expect((await store.createOrder(u.id, 1)).id).toBe(order.id);

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

  it('thiếu tiền / sai nội dung / tiền ra → không lên Pro, ghi "chưa khớp"; sai khoá → 401', async () => {
    const u = setup();
    const order = await store.createOrder(u.id, 12);
    expect(webhook({ id: 1, transferType: 'in', transferAmount: 99000, content: order.code }).body.result).toBe(
      'unmatched',
    );
    expect(webhook({ id: 2, transferType: 'in', transferAmount: 990000, content: 'khong co ma' }).body.result).toBe(
      'unmatched',
    );
    expect(webhook({ id: 3, transferType: 'out', transferAmount: 990000, content: order.code }).body.result).toBe(
      'ignored',
    );
    expect(
      webhook({ id: 4, transferType: 'in', transferAmount: 990000, content: order.code }, 'Apikey sai').statusCode,
    ).toBe(401);
    expect(effectivePlan(users.publicUser(users.findUserById(u.id)!))).toBe('free');
    expect(store.listOrders().unmatched).toHaveLength(2);
    // Đơn đã huỷ mà khách vẫn chuyển → vẫn nhận
    store.cancelOrder(order.id, u.id);
    expect(webhook({ id: 5, transferType: 'in', transferAmount: 990000, content: order.code }).body.result).toBe(
      'activated',
    );
  });

  it('chưa đặt khoá webhook → 503; Quản trị viên xác nhận tay → lên Pro', async () => {
    const u = setup();
    store.saveBillingConfig({ gateways: { sepay: { webhookKey: '' } } });
    expect(webhook({ id: 1 }, 'Apikey ').statusCode).toBe(503);
    const order = await store.createOrder(u.id, 1);
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

describe('payOS', () => {
  const KEYS = { clientId: 'cid', apiKey: 'akey', checksumKey: 'ck-bi-mat' };
  const calls: { url: string; init: RequestInit }[] = [];
  let linkStatus = { status: 'PENDING', amountPaid: 0 };

  function setupPayos() {
    store.saveBillingConfig({ provider: 'payos', options: [{ months: 1, price: 99000 }], gateways: { payos: KEYS } });
    return users.createUser({ username: 'khach', role: 'user', password: 'matkhau123' });
  }

  beforeEach(() => {
    calls.length = 0;
    linkStatus = { status: 'PENDING', amountPaid: 0 };
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const body = init.body ? JSON.parse(String(init.body)) : {};
      const data = url.endsWith('/v2/payment-requests')
        ? {
            bin: '970422',
            accountNumber: 'VA123',
            accountName: 'NGUYEN XUAN THANH',
            amount: body.amount,
            description: body.description,
            orderCode: body.orderCode,
            paymentLinkId: 'link-1',
            status: 'PENDING',
            checkoutUrl: 'https://pay.payos.vn/web/link-1',
            qrCode: '000201',
          }
        : { orderCode: 1, amount: 99000, ...linkStatus };
      return new Response(JSON.stringify({ code: '00', desc: 'success', data }), { status: 200 });
    });
  });

  function hook(data: Record<string, unknown>, signature = payos.payosSign(data, KEYS.checksumKey)) {
    return callHook('payos', { code: '00', desc: 'success', success: true, data, signature });
  }

  it('chữ ký: khoá a→z, null → rỗng, HMAC-SHA256 hex', () => {
    expect(payos.payosDataString({ b: 2, a: 'x', c: null, d: undefined })).toBe('a=x&b=2&c=');
    const sig = payos.payosSign({ amount: 1 }, 'k');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(payos.payosVerify({ amount: 1 }, sig, 'k')).toBe(true);
    expect(payos.payosVerify({ amount: 2 }, sig, 'k')).toBe(false);
  });

  it('chưa nhập đủ khoá → chưa bán; tạo đơn gọi payOS có chữ ký, QR theo tài khoản payOS trả về', async () => {
    store.saveBillingConfig({
      provider: 'payos',
      options: [{ months: 1, price: 99000 }],
      gateways: { payos: { ...KEYS, checksumKey: '' } },
    });
    expect(store.publicBilling().ready).toBe(false);
    const u = setupPayos();
    expect(store.publicBilling()).toMatchObject({ provider: 'payos', ready: true });
    const order = await store.createOrder(u.id, 1, Date.now(), 'https://tool.example.vn');
    const req = calls[0];
    expect(req.url).toBe('https://api-merchant.payos.vn/v2/payment-requests');
    expect((req.init.headers as Record<string, string>)['x-client-id']).toBe('cid');
    const body = JSON.parse(String(req.init.body));
    expect(body).toMatchObject({
      amount: 99000,
      description: order.code,
      returnUrl: 'https://tool.example.vn/upgrade',
    });
    expect(body.description.length).toBeLessThanOrEqual(9);
    const { signature, ...rest } = body;
    const signed = {
      amount: rest.amount,
      cancelUrl: rest.cancelUrl,
      description: rest.description,
      orderCode: rest.orderCode,
      returnUrl: rest.returnUrl,
    };
    expect(signature).toBe(payos.payosSign(signed, KEYS.checksumKey));
    expect(order).toMatchObject({
      provider: 'payos',
      payment: { ref: String(body.orderCode), accountNo: 'VA123', bankBin: '970422' },
    });
  });

  it('webhook đúng chữ ký + đủ tiền → lên Pro; sai chữ ký → 401; đơn lạ (webhook mẫu) → bỏ qua; gửi lại không cộng 2 lần', async () => {
    const u = setupPayos();
    const order = await store.createOrder(u.id, 1);
    const ref = order.payment!.ref;
    const data = {
      orderCode: ref,
      amount: 99000,
      description: order.code,
      reference: 'FT1',
      code: '00',
      desc: 'Thành công',
      counterAccountName: null,
    };
    expect(hook(data, 'sai').statusCode).toBe(401);
    expect(hook({ ...data, orderCode: 123 }).body.result).toBe('ignored');
    expect(hook(data).body.result).toBe('activated');
    expect(store.findOrder(order.id)).toMatchObject({ status: 'paid', txId: `payos:${ref}` });
    const until = users.findUserById(u.id)!.proUntil;
    expect(hook(data).body.result).toBe('duplicate');
    expect(users.findUserById(u.id)!.proUntil).toBe(until);
  });

  it('webhook không tới → web hỏi trạng thái, payOS báo PAID → lên Pro (tối đa 1 lần / 10 giây)', async () => {
    const u = setupPayos();
    const order = await store.createOrder(u.id, 1);
    const now = Date.now();
    expect((await store.syncOrder(order, now)).status).toBe('pending');
    linkStatus = { status: 'PAID', amountPaid: 99000 };
    expect((await store.syncOrder(order, now + 1000)).status).toBe('pending'); // chưa tới 10 giây
    expect((await store.syncOrder(order, now + 11_000)).status).toBe('paid');
    expect(effectivePlan(users.publicUser(users.findUserById(u.id)!))).toBe('pro');
  });

  it('đổi cổng không mất webhook SePay của đơn cũ', async () => {
    const u = setup();
    const old = await store.createOrder(u.id, 1);
    store.saveBillingConfig({ provider: 'payos', gateways: { payos: KEYS } });
    expect(webhook({ id: 7, transferType: 'in', transferAmount: 99000, content: old.code }).body.result).toBe(
      'activated',
    );
  });
});

describe('Khung cổng thanh toán', () => {
  it('mỗi cổng khai báo trong GATEWAYS đều có phần cài đặt (và ngược lại)', () => {
    expect(Object.keys(GATEWAY_IMPLS).sort()).toEqual(GATEWAYS.map((g) => g.id).sort());
    for (const g of GATEWAYS) expect(GATEWAY_IMPLS[g.id].meta).toBe(g);
  });

  it('file cấu hình bản cũ (chỉ SePay, để phẳng) vẫn đọc được — chuyển vào gateways.sepay', () => {
    fs.writeFileSync(
      path.join(dir.path, 'billing.json'),
      JSON.stringify({
        bankBin: '970422',
        accountNo: '0348',
        accountName: 'A B',
        options: [{ months: 1, price: 5000 }],
        webhookKey: 'k',
      }),
    );
    const c = store.getBillingConfig();
    expect(c.provider).toBe('sepay');
    expect(c.gateways.sepay).toEqual({ bankBin: '970422', accountNo: '0348', accountName: 'A B', webhookKey: 'k' });
    expect(c.gateways.payos).toEqual({ clientId: '', apiKey: '', checksumKey: '' });
    expect(store.publicBilling().ready).toBe(true);
  });

  it('mốc thời hạn: mặc định 3/6/9/12; bộ cũ 1/3/12 đổi 1 lần (giữ giá mốc trùng); Quản trị viên tự đặt thì giữ', () => {
    expect(store.getBillingConfig().options.map((o) => o.months)).toEqual([3, 6, 9, 12]);
    fs.writeFileSync(
      path.join(dir.path, 'billing.json'),
      JSON.stringify({
        options: [
          { months: 1, price: 5000 },
          { months: 3, price: 1_500_000 },
          { months: 12, price: 6_000_000 },
        ],
      }),
    );
    expect(store.getBillingConfig().options).toEqual([
      { months: 3, price: 1_500_000 },
      { months: 6, price: 0 },
      { months: 9, price: 0 },
      { months: 12, price: 6_000_000 },
    ]);
    // Đã lưu từ trang quản trị (kể cả đúng 1/3/12) → không đổi nữa; xếp tăng dần, bỏ trùng
    store.saveBillingConfig({
      options: [
        { months: 12, price: 9 },
        { months: 1, price: 1 },
        { months: 3, price: 3 },
        { months: 3, price: 4 },
      ],
    });
    expect(store.getBillingConfig().options.map((o) => o.months)).toEqual([1, 3, 12]);
  });

  it('kiểm tra mốc thời hạn: trùng / ngoài 1–60 / trống bị từ chối', () => {
    expect(proOptionsError([{ months: 3, price: 1 }, { months: 6, price: 0 }])).toBeNull();
    expect(proOptionsError([{ months: 3, price: 1 }, { months: 3, price: 2 }])).toMatch(/trùng/);
    expect(proOptionsError([{ months: 0, price: 1 }])).toBeNull(); // 0 = Vĩnh viễn
    expect(proOptionsError([{ months: -1, price: 1 }])).toMatch(/1 đến 60/);
    expect(proOptionsError([{ months: 61, price: 1 }])).toMatch(/1 đến 60/);
    expect(proOptionsError([])).toMatch(/ít nhất/);
    expect(proOptionsError([{ months: NaN, price: 1 }])).toMatch(/Vĩnh viễn/);
  });

  it('gói Vĩnh viễn: gõ chữ → 0 tháng, xếp cuối, mua xong Pro không hết hạn', () => {
    expect(parseDuration('Vĩnh viễn')).toBe(0);
    expect(parseDuration(' vinh  vien ')).toBe(0);
    expect(parseDuration('Trọn đời')).toBe(0);
    expect(parseDuration('6 tháng')).toBe(6);
    expect(parseDuration('1 năm')).toBe(12);
    expect(parseDuration('abc')).toBeNaN();
    expect(monthsLabel(0)).toBe('Vĩnh viễn');
    store.saveBillingConfig({ options: [{ months: 0, price: 9 }, { months: 3, price: 1 }] });
    expect(store.getBillingConfig().options.map((o) => o.months)).toEqual([3, 0]);
    const now = Date.parse('2026-11-26T00:00:00Z');
    expect(extendProUntil({ plan: 'pro', proUntil: '2026-12-01T00:00:00Z' }, 0, now)).toBeNull();
    expect(extendProUntil({ plan: 'free' }, 0, now)).toBeNull();
  });

  it('đổi cổng giữ nguyên cấu hình cổng kia; ô lạ không được lưu; cổng không tồn tại → 404', () => {
    setup();
    store.saveBillingConfig({ provider: 'payos', gateways: { payos: { clientId: 'x', hack: 'y' } } });
    const c = store.getBillingConfig();
    expect(c.gateways.sepay.webhookKey).toBe('khoa-bi-mat');
    expect(c.gateways.payos).not.toHaveProperty('hack');
    expect(callHook('khong-co', {}).statusCode).toBe(404);
  });
});

describe('Pay2S, Webhook tuỳ chỉnh, Thủ công', () => {
  const BANK = { bankBin: '970422', accountNo: '0348', accountName: 'Nguyen Van A' };
  const OPTS = [{ months: 1, price: 99000 }];
  const newUser = () => users.createUser({ username: 'khach', role: 'user', password: 'matkhau123' });

  it('Pay2S: Bearer token, nhiều giao dịch 1 lần, chỉ tiền vào; sai token → 401', async () => {
    store.saveBillingConfig({ provider: 'pay2s', options: OPTS, gateways: { pay2s: { ...BANK, token: 'tk' } } });
    expect(store.publicBilling().ready).toBe(true);
    const order = await store.createOrder(newUser().id, 1);
    expect(order.payment).toMatchObject({ bankBin: '970422', accountNo: '0348', accountName: 'NGUYEN VAN A' });
    const body = {
      transactions: [
        { id: 1, transferType: 'OUT', transferAmount: 99000, content: order.code },
        { id: 2, transferType: 'IN', transferAmount: 99000, content: `GD ${order.code} 031026` },
      ],
    };
    expect(callHook('pay2s', body, { authorization: 'Bearer sai' }).statusCode).toBe(401);
    const r = callHook('pay2s', body, { authorization: 'Bearer tk' });
    expect(r.body).toMatchObject({ success: true, results: ['ignored', 'activated'] });
    expect(store.findOrder(order.id)?.status).toBe('paid');
  });

  it('Webhook tuỳ chỉnh: mặc định khớp Casso (secure-token, data[] / amount / description / id)', async () => {
    store.saveBillingConfig({ provider: 'custom', options: OPTS, gateways: { custom: { ...BANK, secret: 's3' } } });
    expect(store.publicBilling().ready).toBe(true);
    const order = await store.createOrder(newUser().id, 1);
    const casso = { error: 0, data: [{ id: 77, description: `MBVCB ${order.code}`, amount: 99000 }] };
    expect(callHook('custom', casso, { 'secure-token': 'sai' }).statusCode).toBe(401);
    expect(callHook('custom', casso, { 'secure-token': 's3' }).body.result).toBe('activated');
    expect(callHook('custom', casso, { 'secure-token': 's3' }).body.result).toBe('duplicate');
  });

  it('Webhook tuỳ chỉnh: ô lồng nhau, số tiền dạng chữ, chiều tiền theo ô; tiền âm = tiền ra', async () => {
    store.saveBillingConfig({
      provider: 'custom',
      options: OPTS,
      gateways: {
        custom: {
          ...BANK,
          secret: 'k',
          authHeader: 'x-api-key',
          listPath: 'payload.items',
          amountPath: 'money.value',
          contentPath: 'note',
          idPath: 'ref',
          directionPath: 'type',
          directionIn: 'CREDIT',
        },
      },
    });
    const order = await store.createOrder(newUser().id, 1);
    const item = (type: string, ref: string) => ({ ref, type, note: order.code, money: { value: '99.000' } });
    const hdr = { 'x-api-key': 'Apikey k' };
    expect(callHook('custom', { payload: { items: [item('DEBIT', 'a')] } }, hdr).body.result).toBe('ignored');
    expect(callHook('custom', { payload: { items: [item('credit', 'b')] } }, hdr).body.result).toBe('activated');

    // Không có ô chiều tiền → số tiền âm là tiền ra
    store.saveBillingConfig({
      gateways: {
        custom: { directionPath: '', listPath: '', amountPath: 'amount', contentPath: 'content', idPath: '' },
      },
    });
    const u2 = users.createUser({ username: 'khach2', role: 'user', password: 'matkhau123' });
    const o2 = await store.createOrder(u2.id, 1);
    expect(callHook('custom', { amount: -99000, content: o2.code }, hdr).body.result).toBe('ignored');
    expect(callHook('custom', { amount: 99000, content: o2.code }, hdr).body.result).toBe('activated');
  });

  it('Thủ công: chỉ cần tài khoản; không có webhook; Quản trị viên xác nhận tay', async () => {
    store.saveBillingConfig({ provider: 'manual', options: OPTS, gateways: { manual: BANK } });
    expect(store.publicBilling().ready).toBe(true);
    const order = await store.createOrder(newUser().id, 1);
    expect(order.payment?.description).toBe(order.code);
    expect(callHook('manual', {}).statusCode).toBe(404);
    store.markPaidManually(order.id);
    expect(store.findOrder(order.id)).toMatchObject({ status: 'paid', paidBy: 'manual' });
  });
});

process.on('exit', () => db.closeDb());
process.on('exit', () => fs.rmSync(dir.path, { recursive: true, force: true }));
