import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectivePlan, TRIAL_DAYS } from '../shared/plans';

/* Đăng ký dùng thử: tài khoản khách riêng + Pro TRIAL_DAYS ngày, chống tạo hàng loạt — dữ liệu ở thư mục tạm */
vi.mock('../server/config', async () => {
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  const dir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'signup-'));
  return {
    config: {
      dataDir: dir,
      secretsDir: dir,
      cookieSecure: false,
      root: process.cwd(),
      allowedOrigins: [],
      tiktok: { mcpUrl: 'https://example.invalid/mcp', advertiserId: 'adv', storeId: 'store', advertiserName: 'shop', currency: 'VND' },
    },
  };
});

const db = await import('../server/db/index');
const users = await import('../server/auth/users');
const su = await import('../server/auth/signup');

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-24T03:00:00Z');

beforeEach(() => {
  db.clearAllForTests();
  su.resetSignupLimits();
  delete process.env.SIGNUP;
});

describe('Đăng ký dùng thử', () => {
  it('tạo tài khoản khách riêng (vai trò Người dùng), gói Pro đúng TRIAL_DAYS ngày, đăng nhập được', () => {
    const u = su.signup({ username: 'ShopMoi', name: 'Shop Mới', password: 'matkhau123' }, '1.1.1.1', NOW);
    expect(u.username).toBe('shopmoi');
    expect(u.role).toBe('user');
    expect(u.name).toBe('Shop Mới');
    const pub = users.publicUser(u);
    expect(pub.plan).toBe('pro');
    expect(Date.parse(pub.proUntil!)).toBe(NOW + TRIAL_DAYS * DAY);
    expect(effectivePlan(pub, NOW + (TRIAL_DAYS - 1) * DAY)).toBe('pro');
    expect(effectivePlan(pub, NOW + (TRIAL_DAYS + 1) * DAY)).toBe('free');
    expect(users.verifyLogin('shopmoi', 'matkhau123')?.id).toBe(u.id);
  });

  it('mỗi người đăng ký có tài khoản khách riêng, không vào tài khoản chính', () => {
    const owner = users.createUser({ username: 'sep', password: 'matkhau123', role: 'owner' });
    const a = su.signup({ username: 'khach1', name: 'Khách 1', password: 'matkhau123' }, '1.1.1.1', NOW);
    const b = su.signup({ username: 'khach2', name: 'Khách 2', password: 'matkhau123' }, '2.2.2.2', NOW);
    expect(a.accountId).toBeTruthy();
    expect(a.accountId).not.toBe(owner.accountId);
    expect(a.accountId).not.toBe(b.accountId);
  });

  it('kiểm tra tên hiển thị, tên đăng nhập, mật khẩu, trùng tên', () => {
    const ok = { username: 'abc', name: 'A', password: 'matkhau123' };
    expect(() => su.signup({ ...ok, name: '  ' }, 'ip', NOW)).toThrow(users.UserError);
    expect(() => su.signup({ ...ok, username: 'có dấu' }, 'ip', NOW)).toThrow(users.UserError);
    expect(() => su.signup({ ...ok, password: 'ngan' }, 'ip', NOW)).toThrow(users.UserError);
    su.signup(ok, 'ip', NOW);
    expect(() => su.signup(ok, 'ip2', NOW)).toThrow('Tên đăng nhập đã có');
  });

  it(`tối đa ${3} tài khoản / IP / 24 giờ; lần lỗi không tính; sau 24 giờ được tạo tiếp`, () => {
    expect(() => su.signup({ username: 'x', name: 'X', password: 'matkhau123' }, 'ip', NOW)).toThrow(users.UserError);
    for (let i = 0; i < su.MAX_SIGNUPS_PER_IP; i++) {
      su.signup({ username: `khach${i}`, name: 'K', password: 'matkhau123' }, 'ip', NOW + i);
    }
    expect(() => su.signup({ username: 'khach9', name: 'K', password: 'matkhau123' }, 'ip', NOW + 10)).toThrow(su.SignupLimitError);
    // IP khác vẫn được
    expect(su.signup({ username: 'khac', name: 'K', password: 'matkhau123' }, 'ip-khac', NOW).username).toBe('khac');
    expect(su.signup({ username: 'khach9', name: 'K', password: 'matkhau123' }, 'ip', NOW + 24 * 3_600_000 + 1).username).toBe('khach9');
  });

  it('SIGNUP=off thì tắt đăng ký', () => {
    expect(su.signupEnabled()).toBe(true);
    process.env.SIGNUP = 'off';
    expect(su.signupEnabled()).toBe(false);
  });
});
