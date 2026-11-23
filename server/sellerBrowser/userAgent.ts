import type { BrowserContext, Page } from 'playwright-core';

/**
 * Chrome chạy ẩn (headless) tự xưng "HeadlessChrome" → trang dễ nhận ra là tự động, hay bắt xác minh.
 * Ghi đè để xưng như Chrome thường CÙNG PHIÊN BẢN đang cài trên máy (User-Agent + Client Hints / sec-ch-ua).
 * Chỉ đổi cách trình duyệt tự giới thiệu, không đổi IP / tài khoản / hành vi.
 */

const PLATFORM: Record<string, string> = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };

/** "…HeadlessChrome/157.0.0.0…" → "…Chrome/157.0.0.0…" */
export const normalUserAgent = (ua: string) => ua.replace(/HeadlessChrome\//g, 'Chrome/');

/** Thông tin thương hiệu (Client Hints) như Chrome thường */
export function chromeMetadata(fullVersion: string, platform = process.platform) {
  const major = fullVersion.split('.')[0] || '0';
  return {
    brands: [
      { brand: 'Google Chrome', version: major },
      { brand: 'Chromium', version: major },
      { brand: 'Not_A Brand', version: '24' },
    ],
    fullVersionList: [
      { brand: 'Google Chrome', version: fullVersion },
      { brand: 'Chromium', version: fullVersion },
      { brand: 'Not_A Brand', version: '24.0.0.0' },
    ],
    fullVersion,
    platform: PLATFORM[platform] ?? 'Windows',
    platformVersion: platform === 'win32' ? '10.0.0' : '',
    architecture: 'x86',
    bitness: '64',
    model: '',
    mobile: false,
    wow64: false,
  };
}

/** Áp cho 1 trang (gọi trước khi vào Seller Center) */
export async function useNormalUserAgent(ctx: BrowserContext, page: Page) {
  const cdp = await ctx.newCDPSession(page);
  const v = (await cdp.send('Browser.getVersion')) as { product: string; userAgent: string };
  const fullVersion = v.product.split('/')[1] ?? '';
  await cdp.send('Network.setUserAgentOverride', {
    userAgent: normalUserAgent(v.userAgent),
    acceptLanguage: 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    userAgentMetadata: chromeMetadata(fullVersion),
  });
}
