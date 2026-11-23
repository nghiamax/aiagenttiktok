/**
 * Đăng nhập TikTok for Business cho 1 shop (chạy trên máy): npm run login [-- --shop <id shop>]
 * Không ghi --shop = shop đầu tiên của Quản trị viên (shop chính).
 * Trên VPS dùng nút "Kết nối TikTok" trên web thay cho lệnh này (cùng luồng: server/tiktok/oauthFlow.ts).
 * Token có quyền lớn (cả ghi) → không copy .secrets/ sang máy khác, mỗi máy tự đăng nhập.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createAuthRequest, exchangeAndSave } from './tiktok/oauthFlow.js';
import { autoSelectAccount } from './tiktok/accounts.js';
import { bootDatabase } from './db/boot.js';
import { withShop } from './shopContext.js';

const db = bootDatabase();
const shopArg = process.argv.indexOf('--shop');
const shopId =
  shopArg > 0
    ? process.argv[shopArg + 1]
    : (
        db
          .prepare('SELECT s.id FROM shops s JOIN users u ON u.account_id = s.account_id WHERE u.is_admin = 1 ORDER BY u.created_at, s.created_at LIMIT 1')
          .get() as { id: string } | undefined
      )?.id;

const PORT = 8788;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;

function fail(msg: string): never {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(cmd as string, args as string[], { detached: true, stdio: 'ignore' }).unref();
}

if (!shopId || !db.prepare('SELECT 1 FROM shops WHERE id = ?').get(shopId)) fail('Không tìm thấy shop — dùng --shop <id shop>');
const shop = shopId!;
console.log(`▶ Kết nối TikTok cho shop ${shop}`);

console.log('▶ Đăng ký client');
const req = await createAuthRequest(REDIRECT).catch((e: Error) => fail(e.message));

console.log('▶ Mở trình duyệt để đăng nhập TikTok for Business');
console.log('  Nếu trình duyệt không tự mở, bấm link này:\n  ' + req.authUrl);

const code = await new Promise<string>((resolve) => {
  const timer = setTimeout(() => fail('Hết 5 phút chưa đăng nhập xong.'), 5 * 60_000);
  const server = http.createServer((r, res) => {
    const url = new URL(r.url ?? '/', `http://127.0.0.1:${PORT}`);
    if (url.pathname !== '/callback') return void res.writeHead(404).end();
    const page = (msg: string) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<meta charset="utf-8"><body style="font-family:sans-serif;padding:40px"><h2>${msg}</h2>Có thể đóng tab này.</body>`);
    };
    const err = url.searchParams.get('error');
    if (err) {
      page('Đăng nhập không thành công');
      fail(`Đăng nhập lỗi: ${err} ${url.searchParams.get('error_description') ?? ''}`);
    }
    if (url.searchParams.get('state') !== req.state) {
      page('Sai state');
      fail('state không khớp');
    }
    page('Đã kết nối TikTok ✔');
    clearTimeout(timer);
    server.close();
    resolve(url.searchParams.get('code') ?? '');
  });
  server.listen(PORT, '127.0.0.1', () => openBrowser(req.authUrl));
});

console.log('▶ Đổi code lấy token');
try {
  await withShop(shop, async () => {
    const token = await exchangeAndSave(req, code);
    console.log(`✔ Đã lưu token (hết hạn sau ${token.expires_in ?? '?'} giây, gia hạn tự động: ${Boolean(token.refresh_token)})`);
    const account = await autoSelectAccount();
    console.log(account ? `✔ Tài khoản quảng cáo: ${account.advertiserName ?? account.advertiserId} · shop ${account.storeName ?? account.storeId}` : '! Nhiều tài khoản / shop — chọn trên web (Kết nối TikTok → Chọn tài khoản)');
  });
} catch (e) {
  fail(`Lấy token lỗi: ${(e as Error).message}`);
}
