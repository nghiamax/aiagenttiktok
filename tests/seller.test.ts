import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/* Đăng nhập Seller Center: nhận biết đã đăng nhập theo địa chỉ trang, file tải về theo tài khoản — không mở trình duyệt */
const dir = vi.hoisted(() => ({ path: '' }));
vi.mock('../server/config', async () => {
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  dir.path = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'seller-'));
  return { config: { dataDir: dir.path, secretsDir: dir.path, root: process.cwd(), allowedOrigins: [] } };
});

const s = await import('../server/sellerBrowser/session');
const { sellerRouter } = await import('../server/routes/seller');
const ua = await import('../server/sellerBrowser/userAgent');

describe('Nhận biết đã đăng nhập', () => {
  it('TikTok: trang người bán = đã đăng nhập; trang login / tên miền khác = chưa', () => {
    expect(s.isLoggedInUrl('tiktok', 'https://seller-vn.tiktok.com/homepage')).toBe(true);
    expect(s.isLoggedInUrl('tiktok', 'https://seller-vn.tiktok.com/order?tab=all')).toBe(true);
    expect(s.isLoggedInUrl('tiktok', 'https://seller-vn.tiktok.com/account/login?redirect=x')).toBe(false);
    expect(s.isLoggedInUrl('tiktok', 'https://www.tiktok.com/')).toBe(false);
  });

  it('Shopee: banhang.shopee.vn ngoài trang signin = đã đăng nhập', () => {
    expect(s.isLoggedInUrl('shopee', 'https://banhang.shopee.vn/portal/sale/order')).toBe(true);
    expect(s.isLoggedInUrl('shopee', 'https://banhang.shopee.vn/account/signin?next=')).toBe(false);
    expect(s.isLoggedInUrl('shopee', 'not a url')).toBe(false);
  });
});

describe('File tải về', () => {
  it('liệt kê theo tài khoản, bỏ file đang tải dở; mã file sai dạng không đọc được (chống đi ra ngoài thư mục)', () => {
    const d = s.downloadDir('user-a', 'tiktok');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, '1732000000000-abc123__income.xlsx'), 'x');
    fs.writeFileSync(path.join(d, '1732000000001-abc124__dang-tai.xlsx.crdownload'), 'x');
    expect(s.listDownloads('user-a', 'tiktok').map((f) => f.name)).toEqual(['income.xlsx']);
    expect(s.listDownloads('user-b', 'tiktok')).toEqual([]);
    expect(s.downloadPath('user-a', 'tiktok', '1732000000000-abc123')).toContain('income.xlsx');
    expect(s.downloadPath('user-a', 'tiktok', '../../etc')).toBeNull();
    s.removeDownload('user-a', 'tiktok', '1732000000000-abc123');
    expect(s.listDownloads('user-a', 'tiktok')).toEqual([]);
  });

  it('chưa mở trình duyệt → trạng thái chưa đăng nhập', () => {
    expect(s.sellerState('user-x', 'shopee')).toMatchObject({ status: 'none', open: false });
  });

  it('mọi route cần quyền finance', () => {
    const perms = (sellerRouter.stack as { route?: { stack: { handle: { permission?: string } }[] } }[])
      .filter((l) => l.route)
      .map((l) => l.route!.stack.map((x) => x.handle.permission).find(Boolean));
    expect(perms.length).toBeGreaterThan(5);
    expect(new Set(perms)).toEqual(new Set(['finance']));
  });
});

describe('Chrome ẩn xưng như Chrome thường', () => {
  it('bỏ "HeadlessChrome" khỏi User-Agent; Client Hints = Google Chrome cùng phiên bản', () => {
    expect(ua.normalUserAgent('Mozilla/5.0 (Windows NT 10.0) HeadlessChrome/157.0.0.0 Safari/537.36')).toBe(
      'Mozilla/5.0 (Windows NT 10.0) Chrome/157.0.0.0 Safari/537.36',
    );
    const m = ua.chromeMetadata('157.0.8103.79', 'win32');
    expect(m.brands.map((b) => b.brand)).toContain('Google Chrome');
    expect(JSON.stringify(m)).not.toContain('Headless');
    expect(m).toMatchObject({ platform: 'Windows', fullVersion: '157.0.8103.79', mobile: false });
    expect(m.brands[0].version).toBe('157');
  });
});

process.on('exit', () => fs.rmSync(dir.path, { recursive: true, force: true }));
