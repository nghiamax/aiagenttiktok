/**
 * Đăng nhập TikTok for Business cho server (chạy trên máy): npm run login
 * Đăng ký client (dynamic registration) → mở trình duyệt đăng nhập (OAuth + PKCE) → lưu token vào .secrets/tiktok-mcp.json
 * Token có quyền lớn (cả ghi) → không copy file này sang máy khác, mỗi máy tự đăng nhập.
 */
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { config } from './config.js';
import { oauthMeta, saveToken, tokenRequest } from './tiktok/auth.js';

const PORT = 8788;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPE = 'mcp:tt4b';

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

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

const meta = await oauthMeta();

console.log('▶ Đăng ký client');
const regRes = await fetch(meta.registration_endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_name: 'TikTok Shop Admin (server)',
    redirect_uris: [REDIRECT],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: SCOPE,
  }),
});
if (!regRes.ok) fail(`Đăng ký client lỗi: HTTP ${regRes.status} ${await regRes.text()}`);
const { client_id } = (await regRes.json()) as { client_id: string };

const verifier = b64url(crypto.randomBytes(32));
const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
const state = b64url(crypto.randomBytes(16));
const authUrl = new URL(meta.authorization_endpoint);
for (const [k, v] of Object.entries({
  response_type: 'code',
  client_id,
  redirect_uri: REDIRECT,
  code_challenge: challenge,
  code_challenge_method: 'S256',
  scope: SCOPE,
  state,
  resource: config.tiktok.mcpUrl,
})) authUrl.searchParams.set(k, v);

console.log('▶ Mở trình duyệt để đăng nhập TikTok for Business');
console.log('  Nếu trình duyệt không tự mở, bấm link này:\n  ' + authUrl.href);

const code = await new Promise<string>((resolve) => {
  const timer = setTimeout(() => fail('Hết 5 phút chưa đăng nhập xong.'), 5 * 60_000);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
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
    if (url.searchParams.get('state') !== state) {
      page('Sai state');
      fail('state không khớp');
    }
    page('Đã kết nối TikTok ✔');
    clearTimeout(timer);
    server.close();
    resolve(url.searchParams.get('code') ?? '');
  });
  server.listen(PORT, '127.0.0.1', () => openBrowser(authUrl.href));
});

console.log('▶ Đổi code lấy token');
try {
  const token = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
    client_id,
  });
  saveToken({ client_id, redirect_uri: REDIRECT, ...token });
  console.log(`✔ Đã lưu token (hết hạn sau ${token.expires_in ?? '?'} giây, gia hạn tự động: ${Boolean(token.refresh_token)})`);
} catch (e) {
  fail(`Lấy token lỗi: ${(e as Error).message}`);
}
