// Thử nối MCP TikTok (tt-ads-mcp-flat) từ chương trình ngoài Claude, không cần app developer.
// Đăng ký client (dynamic registration) → đăng nhập OAuth + PKCE trên trình duyệt → gọi 1 tool ĐỌC báo cáo.
// Chạy: node scripts/mcp-probe.mjs   (token lưu ở .secrets/tiktok-mcp.json, đã nằm trong .gitignore)
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';

const MCP_URL = 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-flat';
const AUTH_BASE = `${MCP_URL}/oauth`;
const PORT = 8787;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SECRET_DIR = new URL('../.secrets/', import.meta.url);
const SECRET_FILE = new URL('tiktok-mcp.json', SECRET_DIR);
const SNAPSHOT = { cost: 26779008, revenue: 184774766, orders: 454 }; // 10/11 – 16/11/2026

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const step = (s) => console.log(`\n▶ ${s}`);
const fail = (where, detail) => {
  console.error(`\n✖ LỖI ở bước: ${where}\n${detail}`);
  process.exit(1);
};

function saveSecret(data) {
  fs.mkdirSync(SECRET_DIR, { recursive: true });
  fs.writeFileSync(SECRET_FILE, JSON.stringify({ ...data, savedAt: new Date().toISOString() }, null, 2));
}

/* ───────── 1. Metadata + đăng ký client ───────── */
step('Đọc cấu hình OAuth của MCP TikTok');
const meta = await (await fetch(`${AUTH_BASE}/.well-known/oauth-authorization-server`)).json();
console.log('  authorize:', meta.authorization_endpoint);

step('Đăng ký client (không cần app developer)');
const regRes = await fetch(meta.registration_endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_name: 'TikTok Shop Admin (local)',
    redirect_uris: [REDIRECT],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: 'mcp:tt4b',
  }),
});
const regText = await regRes.text();
if (!regRes.ok) fail('đăng ký client', `HTTP ${regRes.status}: ${regText}`);
const client = JSON.parse(regText);
console.log('  client_id:', client.client_id);

/* ───────── 2. Đăng nhập trên trình duyệt (PKCE) ───────── */
const verifier = b64url(crypto.randomBytes(32));
const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
const state = b64url(crypto.randomBytes(16));
const authUrl = new URL(meta.authorization_endpoint);
for (const [k, v] of Object.entries({
  response_type: 'code',
  client_id: client.client_id,
  redirect_uri: REDIRECT,
  code_challenge: challenge,
  code_challenge_method: 'S256',
  scope: 'mcp:tt4b',
  state,
  resource: MCP_URL,
})) authUrl.searchParams.set(k, v);

step('Mở trình duyệt để Sếp đăng nhập TikTok for Business');
console.log('  Nếu trình duyệt không tự mở, bấm link này:\n  ' + authUrl.href);

const code = await new Promise((resolve) => {
  const timer = setTimeout(() => fail('đăng nhập', 'Hết 5 phút chưa đăng nhập xong.'), 5 * 60_000);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname !== '/callback') return res.writeHead(404).end();
    const err = url.searchParams.get('error');
    const done = (msg) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<meta charset="utf-8"><body style="font-family:sans-serif;padding:40px"><h2>${msg}</h2>Có thể đóng tab này.</body>`);
    };
    if (err) {
      done('Đăng nhập không thành công');
      fail('đăng nhập', `${err}: ${url.searchParams.get('error_description') ?? ''}`);
    }
    if (url.searchParams.get('state') !== state) {
      done('Sai state');
      fail('đăng nhập', 'state không khớp');
    }
    done('Đã kết nối TikTok ✔');
    clearTimeout(timer);
    server.close();
    resolve(url.searchParams.get('code'));
  });
  server.listen(PORT, '127.0.0.1', () => {
    // rundll32 mở link mặc định trên Windows, không bị lỗi với dấu & trong URL
    spawn('rundll32', ['url.dll,FileProtocolHandler', authUrl.href], { detached: true, stdio: 'ignore' }).unref();
  });
});
console.log('  Đã nhận code đăng nhập');

/* ───────── 3. Đổi code lấy token ───────── */
async function tokenRequest(params) {
  const res = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: client.client_id, resource: MCP_URL, ...params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}

step('Đổi code lấy token');
let token;
try {
  token = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier });
} catch (e) {
  fail('lấy token', e.message);
}
saveSecret({ client_id: client.client_id, redirect_uri: REDIRECT, ...token });
console.log(`  OK · hết hạn sau ${token.expires_in ?? '?'} giây · có refresh_token: ${Boolean(token.refresh_token)}`);
console.log('  Đã lưu .secrets/tiktok-mcp.json');

/* ───────── 4. Gọi MCP (chỉ đọc) ───────── */
let sessionId = null;
let protocolVersion = '2025-06-18';
let rpcId = 0;

async function rpc(method, params, isNotification = false) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${token.access_token}`,
    'MCP-Protocol-Version': protocolVersion,
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const body = { jsonrpc: '2.0', method, params };
  if (!isNotification) body.id = ++rpcId;
  const res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  sessionId = res.headers.get('mcp-session-id') ?? sessionId;
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  if (isNotification || !text) return null;
  // Trả về JSON thường hoặc SSE ("data: {...}")
  const json = res.headers.get('content-type')?.includes('text/event-stream')
    ? text
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => JSON.parse(l.slice(5)))
        .find((m) => m.id === body.id)
    : JSON.parse(text);
  if (json?.error) throw new Error(JSON.stringify(json.error));
  return json?.result;
}

step('Kết nối MCP');
try {
  const init = await rpc('initialize', {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: 'tiktok-shop-admin', version: '0.1.0' },
  });
  protocolVersion = init.protocolVersion ?? protocolVersion;
  console.log(`  Server: ${init.serverInfo?.name ?? '?'} · giao thức ${protocolVersion}`);
  await rpc('notifications/initialized', {}, true);
  const tools = await rpc('tools/list', {});
  console.log(`  Số tool thấy được: ${tools.tools.length} · có gmv_max_report_get: ${tools.tools.some((t) => t.name === 'gmv_max_report_get')}`);
} catch (e) {
  fail('kết nối MCP', e.message);
}

step('Gọi báo cáo GMV Max (chỉ đọc) 10/11 – 16/11/2026');
let report;
try {
  const result = await rpc('tools/call', {
    name: 'gmv_max_report_get',
    arguments: {
      advertiser_id: '7579465349544869906',
      store_ids: ['7496093946365052968'],
      start_date: '2026-11-10',
      end_date: '2026-11-16',
      dimensions: ['campaign_id'],
      metrics: ['cost', 'gross_revenue', 'orders'],
      filtering: { gmv_max_promotion_types: ['PRODUCT'] },
      enable_total_metrics: true,
      page_size: 100,
    },
  });
  const text = result.content?.find((c) => c.type === 'text')?.text ?? '';
  report = JSON.parse(text);
} catch (e) {
  fail('gọi báo cáo', e.message);
}
if (report.code !== 0) fail('gọi báo cáo', `TikTok trả code ${report.code}: ${report.message}`);
const t = report.data.total_metrics;
const got = { cost: Number(t.cost), revenue: Number(t.gross_revenue), orders: Number(t.orders) };
console.log(`  Chi ${got.cost.toLocaleString('vi-VN')}đ · DT ${got.revenue.toLocaleString('vi-VN')}đ · ${got.orders} đơn`);
const match = got.cost === SNAPSHOT.cost && got.revenue === SNAPSHOT.revenue && got.orders === SNAPSHOT.orders;
console.log(match ? '  ✔ OK — tổng khớp snapshot' : '  ⚠ Gọi được nhưng số khác snapshot (có thể TikTok vừa cập nhật số)');

/* ───────── 5. Thử gia hạn token ───────── */
step('Thử gia hạn token bằng refresh_token');
if (!token.refresh_token) {
  console.log('  ⚠ Không có refresh_token — hết hạn sẽ phải đăng nhập lại');
} else {
  try {
    const refreshed = await tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refresh_token });
    saveSecret({ client_id: client.client_id, redirect_uri: REDIRECT, ...token, ...refreshed });
    console.log(`  ✔ Gia hạn token: OK · hết hạn sau ${refreshed.expires_in ?? '?'} giây`);
  } catch (e) {
    console.log('  ⚠ Gia hạn token lỗi:', e.message);
  }
}

console.log('\nXONG.');
