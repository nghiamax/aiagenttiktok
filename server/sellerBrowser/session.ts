import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright-core';
import { config } from '../config.js';

/**
 * Đăng nhập Seller Center (TikTok Shop / Shopee) bằng trình duyệt thật trên MÁY CHẠY SERVER:
 *  - Server mở Chrome (hoặc Edge) có giao diện, người dùng tự đăng nhập trong cửa sổ đó — server KHÔNG nhận mật khẩu.
 *    Đăng nhập xong → cửa sổ TỰ ĐÓNG (Sếp chốt 22/11, bảo mật). Mở lại khi đã đăng nhập (lấy file) thì không tự đóng.
 *  - Phiên (cookie) lưu trong hồ sơ trình duyệt riêng mỗi tài khoản: .secrets/seller/<userId>/<platform>-profile (không commit).
 *  - Mở lại để lấy file: mọi file tải về trong cửa sổ đó được lưu vào server-data/seller-downloads/<userId>/<platform>/
 *    → trang Tính lợi nhuận tự nhận. Agent KHÔNG tự bấm trên Seller Center (chỉ mở trang + bắt file tải về).
 * Chỉ dùng được khi server chạy trên máy có màn hình (máy tính của Sếp) — hosting / VPS không có cửa sổ để đăng nhập.
 */

export type SellerPlatform = 'tiktok' | 'shopee';
export const SELLER_PLATFORMS: SellerPlatform[] = ['tiktok', 'shopee'];
export const isSellerPlatform = (v: unknown): v is SellerPlatform => v === 'tiktok' || v === 'shopee';

interface PlatformDef {
  label: string;
  home: string;
  host: string;
  /** Đường dẫn trang đăng nhập / đăng ký → chưa đăng nhập */
  loginPath: RegExp;
}

export const PLATFORM: Record<SellerPlatform, PlatformDef> = {
  tiktok: {
    label: 'TikTok Seller Center',
    home: 'https://seller-vn.tiktok.com/',
    host: 'seller-vn.tiktok.com',
    loginPath: /login|register|passport|signup/i,
  },
  shopee: {
    label: 'Shopee Kênh Người Bán',
    home: 'https://banhang.shopee.vn/',
    host: 'banhang.shopee.vn',
    loginPath: /signin|login|register|signup/i,
  },
};

/** Đã vào trang người bán (không còn ở trang đăng nhập) */
export function isLoggedInUrl(platform: SellerPlatform, url: string): boolean {
  try {
    const u = new URL(url);
    const def = PLATFORM[platform];
    return u.hostname === def.host && !def.loginPath.test(u.pathname + u.search);
  } catch {
    return false;
  }
}

export type SellerStatus = 'none' | 'waiting_login' | 'logged_in';

interface SellerMeta {
  loggedInAt: string | null;
  lastOpenAt: string | null;
}

export interface SellerState {
  platform: SellerPlatform;
  status: SellerStatus;
  /** Cửa sổ trình duyệt đang mở */
  open: boolean;
  loggedInAt: string | null;
  lastOpenAt: string | null;
  error: string | null;
}

export interface SellerDownload {
  id: string;
  name: string;
  size: number;
  at: string;
}

const userDir = (userId: string) => path.join(config.secretsDir, 'seller', userId.replace(/[^a-zA-Z0-9-]/g, ''));
const profileDir = (userId: string, p: SellerPlatform) => path.join(userDir(userId), `${p}-profile`);
/** Hồ sơ trình duyệt đã đăng nhập (lấy file tự động chạy ẩn bằng hồ sơ này) */
export const profilePath = profileDir;
const metaFile = (userId: string, p: SellerPlatform) => path.join(userDir(userId), `${p}.json`);
export const downloadDir = (userId: string, p: SellerPlatform) =>
  path.join(config.dataDir, 'seller-downloads', userId.replace(/[^a-zA-Z0-9-]/g, ''), p);

function readMeta(userId: string, p: SellerPlatform): SellerMeta {
  try {
    return { loggedInAt: null, lastOpenAt: null, ...JSON.parse(fs.readFileSync(metaFile(userId, p), 'utf8')) };
  } catch {
    return { loggedInAt: null, lastOpenAt: null };
  }
}

function writeMeta(userId: string, p: SellerPlatform, meta: SellerMeta) {
  fs.mkdirSync(userDir(userId), { recursive: true });
  fs.writeFileSync(metaFile(userId, p), JSON.stringify(meta, null, 2), { mode: 0o600 });
}

interface Live {
  context: BrowserContext;
  timer: ReturnType<typeof setInterval>;
  error: string | null;
}
const live = new Map<string, Live>();
const keyOf = (userId: string, p: SellerPlatform) => `${userId}|${p}`;
const lastError = new Map<string, string>();

export class SellerError extends Error {}

export function sellerState(userId: string, p: SellerPlatform): SellerState {
  const meta = readMeta(userId, p);
  const l = live.get(keyOf(userId, p));
  return {
    platform: p,
    status: meta.loggedInAt ? 'logged_in' : l ? 'waiting_login' : 'none',
    open: !!l,
    loggedInAt: meta.loggedInAt,
    lastOpenAt: meta.lastOpenAt,
    error: l?.error ?? lastError.get(keyOf(userId, p)) ?? null,
  };
}

/** Mở Chrome (không có thì Edge) với hồ sơ riêng của tài khoản */
async function launch(userId: string, p: SellerPlatform): Promise<BrowserContext> {
  const { chromium } = await import('playwright-core');
  const dir = profileDir(userId, p);
  fs.mkdirSync(dir, { recursive: true });
  let lastErr: unknown = null;
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launchPersistentContext(dir, {
        channel,
        headless: false,
        acceptDownloads: true,
        viewport: null,
        args: ['--start-maximized'],
        // Cho cài tiện ích (Sếp yêu cầu 23/11) — chỉ cửa sổ đăng nhập; lấy file chạy ẩn (tiktokFetch.ts) vẫn tắt tiện ích.
        // Lưu ý: tiện ích cài ở đây đọc được trang Seller Center + cookie của phiên này.
        ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'],
      });
    } catch (e) {
      lastErr = e;
      // Hồ sơ đang mở ở cửa sổ khác → báo rõ
      if (
        String((e as Error)?.message).includes('ProcessSingleton') ||
        String(e).includes('user data directory is already in use')
      ) {
        throw new SellerError(
          'Cửa sổ Seller Center của tài khoản này đang mở — dùng cửa sổ đó hoặc đóng lại rồi thử lại',
        );
      }
    }
  }
  throw new SellerError(
    `Không mở được Chrome / Edge trên máy chạy server (${String((lastErr as Error)?.message ?? lastErr).split('\n')[0]})`,
  );
}

/** Lưu mọi file tải về trong cửa sổ vào thư mục của tài khoản */
function captureDownloads(page: Page, userId: string, p: SellerPlatform) {
  page.on('download', async (d) => {
    try {
      const dir = downloadDir(userId, p);
      fs.mkdirSync(dir, { recursive: true });
      const name =
        d
          .suggestedFilename()
          .replace(/[\\/:*?"<>|]/g, '_')
          .slice(0, 150) || 'file';
      const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      await d.saveAs(path.join(dir, `${id}__${name}`));
    } catch {
      /* tải lỗi / bị huỷ → bỏ qua */
    }
  });
}

/**
 * Mở cửa sổ Seller Center. Chưa đăng nhập → trang đăng nhập (người dùng tự đăng nhập; server theo dõi địa chỉ trang
 * để biết đã vào được trang người bán). Đã đăng nhập → mở trang chủ người bán để xuất file (file tải về được bắt lại).
 */
export async function openSeller(userId: string, p: SellerPlatform): Promise<SellerState> {
  const k = keyOf(userId, p);
  const existing = live.get(k);
  if (existing) {
    const page = existing.context.pages()[0] ?? (await existing.context.newPage());
    await page.bringToFront().catch(() => undefined);
    return sellerState(userId, p);
  }
  lastError.delete(k);
  const context = await launch(userId, p);
  context.on('page', (pg) => captureDownloads(pg, userId, p));
  for (const pg of context.pages()) captureDownloads(pg, userId, p);
  const page = context.pages()[0] ?? (await context.newPage());
  const meta = readMeta(userId, p);
  writeMeta(userId, p, { ...meta, lastOpenAt: new Date().toISOString() });

  // Theo dõi đăng nhập: có trang nào của người bán (không phải trang đăng nhập) → đã đăng nhập
  const timer = setInterval(() => {
    const ok = context.pages().some((pg) => isLoggedInUrl(p, pg.url()));
    const m = readMeta(userId, p);
    if (ok && !m.loggedInAt) {
      writeMeta(userId, p, { ...m, loggedInAt: new Date().toISOString() });
      // Vừa đăng nhập xong → tự đóng cửa sổ (bảo mật; phiên đã lưu trong hồ sơ). Chờ 3 giây cho cookie ghi xong.
      setTimeout(() => void context.close().catch(() => undefined), 3000);
    }
  }, 2000);
  live.set(k, { context, timer, error: null });
  context.on('close', () => {
    clearInterval(timer);
    live.delete(k);
  });
  try {
    await page.goto(PLATFORM[p].home, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch (e) {
    const l = live.get(k);
    if (l) l.error = `Không mở được ${PLATFORM[p].label}: ${String((e as Error).message).split('\n')[0]}`;
  }
  // Phiên cũ hết hạn → sàn đưa về trang đăng nhập → bỏ dấu "đã đăng nhập" để chờ đăng nhập lại
  setTimeout(() => {
    const l = live.get(k);
    if (!l) return;
    const pages = l.context.pages();
    if (pages.length && pages.every((pg) => !isLoggedInUrl(p, pg.url()))) {
      const m = readMeta(userId, p);
      if (m.loggedInAt) writeMeta(userId, p, { ...m, loggedInAt: null });
    }
  }, 8000);
  return sellerState(userId, p);
}

export async function closeSeller(userId: string, p: SellerPlatform) {
  const l = live.get(keyOf(userId, p));
  if (l) await l.context.close().catch(() => undefined);
}

/** Đăng xuất: đóng cửa sổ + xoá hồ sơ trình duyệt (cookie) + file đã tải */
export async function logoutSeller(userId: string, p: SellerPlatform) {
  await closeSeller(userId, p);
  fs.rmSync(profileDir(userId, p), { recursive: true, force: true });
  fs.rmSync(metaFile(userId, p), { force: true });
  fs.rmSync(downloadDir(userId, p), { recursive: true, force: true });
  lastError.delete(keyOf(userId, p));
}

/** Xoá tài khoản → xoá mọi phiên Seller Center của tài khoản đó */
export async function deleteSellerData(userId: string) {
  for (const p of SELLER_PLATFORMS) await closeSeller(userId, p);
  fs.rmSync(userDir(userId), { recursive: true, force: true });
  fs.rmSync(path.dirname(downloadDir(userId, 'tiktok')), { recursive: true, force: true });
}

/** File đã tải về (mới nhất trước) — bỏ file Chrome đang tải dở */
export function listDownloads(userId: string, p: SellerPlatform): SellerDownload[] {
  const dir = downloadDir(userId, p);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.includes('__') && !/\.(crdownload|tmp)$/i.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { id: f.split('__')[0], name: f.slice(f.indexOf('__') + 2), size: st.size, at: st.mtime.toISOString() };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function downloadPath(userId: string, p: SellerPlatform, id: string): string | null {
  if (!/^[0-9]+-[0-9a-f]{6}$/.test(id)) return null;
  const dir = downloadDir(userId, p);
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).find((x) => x.startsWith(`${id}__`));
  return f ? path.join(dir, f) : null;
}

export function removeDownload(userId: string, p: SellerPlatform, id: string) {
  const f = downloadPath(userId, p, id);
  if (f) fs.rmSync(f, { force: true });
}

/** Tắt server → đóng các cửa sổ đang mở */
export async function closeAllSellers() {
  await Promise.all([...live.values()].map((l) => l.context.close().catch(() => undefined)));
}

/** Phiên hết hạn (sàn đưa về trang đăng nhập khi lấy file) → bỏ dấu đã đăng nhập */
export function markLoggedOut(userId: string, p: SellerPlatform) {
  const m = readMeta(userId, p);
  if (m.loggedInAt) writeMeta(userId, p, { ...m, loggedInAt: null });
}
