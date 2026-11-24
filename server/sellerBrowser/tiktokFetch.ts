import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Download, Page } from 'playwright-core';
import { closeSeller, downloadDir, isLoggedInUrl, markLoggedOut, profilePath } from './session.js';
import { useNormalUserAgent } from './userAgent.js';

/**
 * Lấy file TikTok Seller Center TỰ ĐỘNG, chạy ẨN (không mở cửa sổ) bằng phiên đã đăng nhập:
 *  1. Tài chính → Giao dịch → Đã quyết toán → Xuất (chọn kỳ) → Lịch sử xuất dữ liệu → tải
 *  2. Tab Sẽ quyết toán → như trên
 *  3. Đơn hàng → Tất cả → Xuất (CSV, cả tab — web lọc theo kỳ)
 *  4. Marketing → Quảng cáo cửa hàng (GMV Max) → chọn kỳ → Danh sách chiến dịch → Xuất
 * File tải về vào server-data/seller-downloads/<userId>/tiktok → trang Tính lợi nhuận tự nhận (SellerFetchCard).
 * Chỉ thao tác xuất file (giống người bấm), không sửa gì trên shop. Giao diện Seller Center đổi → bước đó báo lỗi rõ.
 */

const BASE = 'https://seller-vn.tiktok.com';
const FIN_URL = `${BASE}/finance/transactions?shop_region=VN&tab=settled_tab`;
const ORDER_URL = `${BASE}/order?selected_sort=6&tab=all`;
const ADS_URL = `${BASE}/ads-creation/dashboard?origin=SC_ads_tab_button_PC`;
/** Chờ file báo cáo được tạo xong tối đa */
const FILE_WAIT_MS = 120_000;

export type StepKey = 'settled' | 'unsettled' | 'orders' | 'ads';
export type StepStatus = 'pending' | 'running' | 'done' | 'empty' | 'error';

export interface FetchStep {
  key: StepKey;
  label: string;
  status: StepStatus;
  message: string | null;
  file: string | null;
}

export interface FetchJob {
  id: string;
  from: string;
  to: string;
  running: boolean;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  steps: FetchStep[];
}

const jobs = new Map<string, FetchJob>();

export const fetchJobOf = (userId: string) => jobs.get(userId) ?? null;

const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const todayVn = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

/** Chọn 1 ngày trên lịch 2 tháng của Seller Center (đã thử 22/11/2026) */
async function pickDate(page: Page, iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  for (let i = 0; i < 36; i++) {
    const labels = await page.locator('.p-picker-header-value').allInnerTexts();
    if (!labels.length) throw new Error('Không thấy lịch chọn ngày');
    const [lm, ly] = labels[0].replace(/\s/g, '').split('/').map(Number);
    const diff = (y - ly) * 12 + (m - lm);
    if (diff === 0 || diff === 1) {
      const panel = page.locator('.p-panel-date-inner').nth(diff);
      const cell = panel.locator('.p-picker-cell-in-view:not(.p-picker-cell-disabled)').filter({
        has: page.locator('.p-picker-date-value', { hasText: new RegExp(`^${String(d).padStart(2, '0')}$`) }),
      });
      if (!(await cell.count())) throw new Error(`Ngày ${iso} không chọn được trên Seller Center`);
      await cell.first().click();
      return;
    }
    const icons = page.locator('.p-picker-header-icon:not(.p-picker-header-icon-hidden)');
    const n = await icons.count();
    await icons.nth(diff < 0 ? 1 : n - 2).click(); // ‹ tháng trước · › tháng sau
    await page.waitForTimeout(200);
  }
  throw new Error(`Không chuyển được lịch tới tháng của ngày ${iso}`);
}

/** Đợi + bắt file tải về trong lúc chạy `action` */
async function catchDownload(page: Page, action: () => Promise<void>, timeout = 30_000): Promise<Download | null> {
  const wait = page.waitForEvent('download', { timeout }).catch(() => null);
  await action();
  return wait;
}

async function saveDownload(d: Download, userId: string): Promise<string> {
  const dir = downloadDir(userId, 'tiktok');
  fs.mkdirSync(dir, { recursive: true });
  const name =
    d
      .suggestedFilename()
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 150) || 'file';
  await d.saveAs(path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}__${name}`));
  return name;
}

/** Kết quả API xuất quyết toán (để biết "Không có dữ liệu để xuất") */
function watchExportResult(page: Page) {
  let result: { code: number; message: string } | null = null;
  const onResp = async (r: import('playwright-core').Response) => {
    if (!/\/pay\/settlement\/file\/export|\/order\/export/i.test(r.url())) return;
    try {
      const j = (await r.json()) as { code?: number; message?: string };
      result = { code: Number(j.code ?? 0), message: String(j.message ?? '') };
    } catch {
      /* bỏ qua */
    }
  };
  page.on('response', onResp);
  return {
    get: () => result,
    stop: () => page.off('response', onResp),
  };
}

/** Gỡ hộp khảo sát (feelgood) hay hiện đè lên nút + cuộn lên đầu trang */
async function clearPopups(page: Page) {
  await page.keyboard.press('Escape').catch(() => undefined);
  // Chuỗi (không phải hàm) vì server không có kiểu DOM
  await page
    .evaluate(
      "document.querySelectorAll('[class*=feelgood], [id*=feelgood]').forEach((e) => e.remove()); window.scrollTo(0, 0);",
    )
    .catch(() => undefined);
}

/** Nút tải trong danh sách lịch sử: chữ "Tải xuống" hoặc icon có nhãn / class tải */
function downloadControl(page: Page) {
  return page
    .locator('button, a, [role=button], span')
    .filter({ hasText: /^(Tải xuống|Tải về|Download)$/ })
    .or(page.locator('[aria-label*="Tải"], [aria-label*="ownload"], [title*="Tải xuống"], [class*="download-icon"]'))
    .first();
}

/** Bấm nút tải ở dòng mới nhất trong danh sách lịch sử xuất (thử lại tới khi file tạo xong) */
async function downloadLatest(page: Page, openHistory: () => Promise<void>, userId: string): Promise<string> {
  const deadline = Date.now() + FILE_WAIT_MS;
  while (Date.now() < deadline) {
    await openHistory();
    await page.waitForTimeout(2500);
    const btn = downloadControl(page);
    if (await btn.count()) {
      const d = await catchDownload(page, () => btn.click());
      if (d) return saveDownload(d, userId);
    }
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(5000);
  }
  throw new Error('Quá 2 phút chưa có file trong "Lịch sử xuất dữ liệu"');
}

async function exportFinance(page: Page, userId: string, tab: 'settled' | 'unsettled', from: string, to: string) {
  await page.goto(FIN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(6000);
  if (!isLoggedInUrl('tiktok', page.url())) throw new LoginExpired();
  await clearPopups(page);
  if (tab === 'unsettled') {
    await page.getByText('Sẽ quyết toán', { exact: true }).first().click();
    await page.waitForTimeout(4000);
  }
  const watch = watchExportResult(page);
  try {
    await page
      .getByRole('button', { name: /^Xuất$/ })
      .first()
      .click();
    await page.waitForTimeout(1200);
    const start = page.getByText('Thời gian bắt đầu', { exact: true });
    if (await start.count()) {
      await start.last().click();
      await page.waitForTimeout(600);
      await pickDate(page, from);
      await pickDate(page, to);
      await page.getByRole('button', { name: /^OK$/ }).last().click();
      await page.waitForTimeout(600);
    }
    const go = page.getByRole('button', { name: /^Xuất$/ }).last();
    // Không có hộp chọn ngày mà xuất tải luôn → bắt file ngay
    const direct = await catchDownload(page, () => go.click(), 8000);
    if (direct) return { file: await saveDownload(direct, userId) };
    await page.waitForTimeout(2500);
    const r = watch.get();
    if (r && r.code !== 0) return { empty: r.message || 'Không có dữ liệu để xuất' };
  } finally {
    watch.stop();
  }
  const history = async () => {
    await page
      .getByRole('button', { name: /Lịch sử xuất dữ liệu/ })
      .first()
      .click();
  };
  return { file: await downloadLatest(page, history, userId) };
}

async function exportOrders(page: Page, userId: string) {
  await page.goto(ORDER_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(6000);
  if (!isLoggedInUrl('tiktok', page.url())) throw new LoginExpired();
  await clearPopups(page);
  if (/Tìm thấy 0 đơn hàng/.test(await page.locator('body').innerText())) return { empty: 'Shop chưa có đơn hàng' };
  await page
    .getByRole('button', { name: /^Xuất$/ })
    .first()
    .click();
  await page.waitForTimeout(1500);
  await page.getByText('Tất cả đơn hàng trong tab hiện tại').first().click();
  await page
    .getByText('CSV', { exact: true })
    .first()
    .click()
    .catch(() => undefined);
  const drawerGo = page.getByRole('button', { name: /^Xuất$/ }).last();
  const direct = await catchDownload(page, () => drawerGo.click(), 8000);
  if (direct) return { file: await saveDownload(direct, userId) };
  // File đơn hàng hiện ở "Lịch sử xuất dữ liệu" ngay trong khung Xuất đơn hàng
  const reopen = async () => {
    const opened = await page.getByText('Lịch sử xuất dữ liệu').count();
    if (!opened) {
      await page
        .getByRole('button', { name: /^Xuất$/ })
        .first()
        .click();
      await page.waitForTimeout(1500);
    }
  };
  return { file: await downloadLatest(page, reopen, userId) };
}

/** Gõ ngày vào ô chọn khoảng ngày kiểu arco (Bảng thông tin quảng cáo) */
async function typeArcoDate(page: Page, placeholder: string, iso: string) {
  const input = page.locator(`input[placeholder="${placeholder}"]`).first();
  await input.click({ force: true });
  await page.keyboard.press('Control+A');
  await page.keyboard.type(iso, { delay: 30 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
}

async function exportAds(page: Page, userId: string, from: string, to: string) {
  await page.goto(ADS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(10_000);
  if (!isLoggedInUrl('tiktok', page.url())) throw new LoginExpired();
  await clearPopups(page);
  await typeArcoDate(page, 'Ngày bắt đầu', from);
  await typeArcoDate(page, 'Ngày kết thúc', to);
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(5000);
  await clearPopups(page);
  if (/Không tìm thấy chiến dịch nào/.test(await page.locator('body').innerText())) {
    return { empty: 'Không có chiến dịch quảng cáo trong kỳ' };
  }
  // Danh sách chiến dịch → Xuất ▾ → "Tổng hợp" (cả kỳ, file "Campaign overview data") → file ở "Lịch sử xuất" cùng menu
  const openMenu = async () => {
    await clearPopups(page);
    await page.getByRole('button', { name: /^Xuất/ }).first().click({ force: true });
    await page.waitForTimeout(1200);
  };
  await openMenu();
  const direct = await catchDownload(page, () => page.getByText('Tổng hợp', { exact: true }).first().click(), 10_000);
  if (direct) return { file: await saveDownload(direct, userId) };
  return { file: await downloadLatest(page, openMenu, userId) };
}

class LoginExpired extends Error {
  constructor() {
    super('Phiên đăng nhập TikTok Seller đã hết hạn — vào Quản lý shop → TikTok để đăng nhập lại');
  }
}

/**
 * Bắt đầu lấy file cho kỳ [from, to] (ngày đặt đơn). Quyết toán lấy tới to + 20 ngày (đơn cuối kỳ quyết toán muộn),
 * không quá hôm nay, tối đa 90 ngày / lần (giới hạn của Seller Center).
 */
export function startTikTokFetch(userId: string, from: string, to: string): FetchJob {
  const cur = jobs.get(userId);
  if (cur?.running) return cur;
  const job: FetchJob = {
    id: crypto.randomUUID(),
    from,
    to,
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    steps: [
      { key: 'settled', label: 'Đã quyết toán', status: 'pending', message: null, file: null },
      { key: 'unsettled', label: 'Chờ quyết toán', status: 'pending', message: null, file: null },
      { key: 'orders', label: 'Đơn hàng', status: 'pending', message: null, file: null },
      { key: 'ads', label: 'Quảng cáo', status: 'pending', message: null, file: null },
    ],
  };
  jobs.set(userId, job);
  void runJob(userId, job);
  return job;
}

async function runJob(userId: string, job: FetchJob) {
  let ctx: BrowserContext | null = null;
  const finTo = [addDays(job.to, 20), todayVn()].sort()[0];
  const finFrom = [job.from, addDays(finTo, -89)].sort().reverse()[0];
  try {
    // Cửa sổ đăng nhập đang mở dùng chung hồ sơ → đóng trước
    await closeSeller(userId, 'tiktok');
    const { chromium } = await import('playwright-core');
    let lastErr: unknown = null;
    for (const channel of ['chrome', 'msedge']) {
      try {
        ctx = await chromium.launchPersistentContext(profilePath(userId, 'tiktok'), {
          channel,
          headless: true,
          acceptDownloads: true,
          viewport: { width: 1440, height: 900 },
        });
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!ctx) throw new Error(`Không mở được Chrome / Edge (${String((lastErr as Error)?.message).split('\n')[0]})`);
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    page.setDefaultTimeout(15_000); // thao tác kẹt (giao diện đổi) → báo lỗi bước đó sau 15 giây, không treo
    // Xưng như Chrome thường (không phải HeadlessChrome) — ít bị bắt xác minh hơn
    await useNormalUserAgent(ctx, page).catch(() => undefined);
    for (const step of job.steps) {
      step.status = 'running';
      try {
        const r =
          step.key === 'orders'
            ? await exportOrders(page, userId)
            : step.key === 'ads'
              ? await exportAds(page, userId, job.from, [job.to, todayVn()].sort()[0])
              : await exportFinance(page, userId, step.key, finFrom, finTo);
        if ('file' in r && r.file) {
          step.status = 'done';
          step.file = r.file;
        } else {
          step.status = 'empty';
          step.message = 'empty' in r ? (r.empty ?? null) : null;
        }
      } catch (e) {
        if (e instanceof LoginExpired) {
          markLoggedOut(userId, 'tiktok');
          throw e;
        }
        step.status = 'error';
        step.message = String((e as Error).message)
          .split('\n')[0]
          .slice(0, 200);
      }
    }
  } catch (e) {
    job.error = String((e as Error).message)
      .split('\n')[0]
      .slice(0, 300);
    for (const s of job.steps) if (s.status === 'pending' || s.status === 'running') s.status = 'error';
  } finally {
    await ctx?.close().catch(() => undefined);
    job.running = false;
    job.finishedAt = new Date().toISOString();
  }
}
