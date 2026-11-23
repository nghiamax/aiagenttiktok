/**
 * Đăng nhập TikTok for Business (OAuth + PKCE, dynamic registration) — dùng chung cho:
 *  - `npm run login` (redirect về 127.0.0.1 trên máy chạy server)
 *  - nút "Kết nối TikTok" trên web (redirect về chính trang web: <origin>/api/tiktok/callback)
 * Chỉ đăng ký client + đổi code lấy token. Không gọi tool MCP nào.
 */
import crypto from 'node:crypto';
import type { ActorRef } from '../../shared/permissions.js';
import { config } from '../config.js';
import { deleteToken, oauthMeta, readToken, saveToken, tokenRequest } from './auth.js';
import { applyAccount, autoSelectAccount } from './accounts.js';
import { currentShopId, withShop } from '../shopContext.js';

export const SCOPE = 'mcp:tt4b';
/** Phiên đăng nhập web chờ TikTok trả về tối đa 10 phút */
export const PENDING_TTL_MS = 10 * 60_000;

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Đăng ký client mới với địa chỉ trả về `redirect` → client_id */
export async function registerClient(redirect: string, clientName = 'TikTok Shop Admin (server)'): Promise<string> {
  const meta = await oauthMeta();
  const res = await fetch(meta.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    }),
  });
  if (!res.ok) throw new Error(`Đăng ký với TikTok lỗi: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const { client_id } = (await res.json()) as { client_id?: string };
  if (!client_id) throw new Error('TikTok không trả client_id');
  return client_id;
}

export interface AuthRequest {
  clientId: string;
  redirect: string;
  verifier: string;
  state: string;
  authUrl: string;
}

/** Đăng ký client + tạo link đăng nhập TikTok (PKCE S256) */
export async function createAuthRequest(redirect: string): Promise<AuthRequest> {
  const meta = await oauthMeta();
  const clientId = await registerClient(redirect);
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  const url = new URL(meta.authorization_endpoint);
  for (const [k, v] of Object.entries({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: SCOPE,
    state,
    resource: config.tiktok.mcpUrl,
  })) url.searchParams.set(k, v);
  return { clientId, redirect, verifier, state, authUrl: url.href };
}

/** Đổi code lấy token rồi lưu (ghi đè token cũ, xoá dấu "gia hạn thất bại") */
export async function exchangeAndSave(req: Pick<AuthRequest, 'clientId' | 'redirect' | 'verifier'>, code: string, by?: ActorRef) {
  const token = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: req.redirect,
    code_verifier: req.verifier,
    client_id: req.clientId,
  });
  saveToken({
    client_id: req.clientId,
    redirect_uri: req.redirect,
    ...token,
    connectedAt: new Date().toISOString(),
    ...(by ? { connectedBy: by } : {}),
  });
  return token;
}

/* ───────── Đăng nhập từ web: state dùng 1 lần, gắn với người bấm, hết hạn sau 10 phút ───────── */

interface Pending extends AuthRequest {
  userId: string;
  /** Shop đang mở lúc bấm Kết nối — token lưu vào đúng shop này */
  shopId: string;
  by: ActorRef;
  expires: number;
}
const pending = new Map<string, Pending>();

export class ConnectError extends Error {
  constructor(
    public readonly code: 'BAD_STATE' | 'EXPIRED' | 'WRONG_USER' | 'DENIED' | 'NO_CODE' | 'TOKEN_FAILED',
    message: string,
  ) {
    super(message);
  }
}

function sweep(now: number) {
  for (const [k, p] of pending) if (p.expires <= now) pending.delete(k);
}

/** Bước 1 (web): tạo link đăng nhập TikTok cho người đang bấm, cho shop đang mở */
export async function startConnect(redirect: string, user: ActorRef, now = Date.now()): Promise<string> {
  sweep(now);
  const shopId = currentShopId();
  const req = await createAuthRequest(redirect);
  pending.set(req.state, { ...req, userId: user.id, shopId, by: user, expires: now + PENDING_TTL_MS });
  return req.authUrl;
}

/** Bước 2 (web): TikTok trả về → kiểm tra state (đúng người, còn hạn, dùng 1 lần) → đổi code lấy token */
export async function finishConnect(
  q: { state?: string; code?: string; error?: string; error_description?: string },
  /** Người đang đăng nhập web ở trình duyệt TikTok trả về; null = trình duyệt khác chưa đăng nhập web (copy link) — state đã gắn người bấm */
  userId: string | null,
  now = Date.now(),
) {
  const p = q.state ? pending.get(q.state) : undefined;
  if (!p) throw new ConnectError('BAD_STATE', 'Phiên kết nối không hợp lệ hoặc đã dùng — bấm Kết nối TikTok lại');
  pending.delete(p.state); // dùng 1 lần
  if (p.expires <= now) throw new ConnectError('EXPIRED', 'Quá 10 phút chưa đăng nhập xong — bấm Kết nối TikTok lại');
  if (userId !== null && p.userId !== userId) throw new ConnectError('WRONG_USER', 'Phiên kết nối không phải của tài khoản này');
  if (q.error) throw new ConnectError('DENIED', `TikTok từ chối: ${q.error_description || q.error}`);
  if (!q.code) throw new ConnectError('NO_CODE', 'TikTok không trả mã đăng nhập');
  await withShop(p.shopId, async () => {
    try {
      await exchangeAndSave(p, q.code!, p.by);
    } catch (e) {
      throw new ConnectError('TOKEN_FAILED', `Không lấy được quyền từ TikTok: ${(e as Error).message.slice(0, 200)}`);
    }
    // Tự chọn tài khoản quảng cáo (1 tài khoản / 1 shop TikTok); nhiều → chủ shop chọn trên web
    await autoSelectAccount();
  });
  return { shopId: p.shopId };
}

/* ───────── Ngắt kết nối: thu hồi token phía TikTok (RFC 7009) rồi xoá token trên máy ───────── */

/**
 * Thu hồi refresh_token + access_token ở TikTok, rồi LUÔN xoá file token trên máy (kể cả khi TikTok lỗi / rớt mạng).
 * revoked = TikTok xác nhận thu hồi cả hai.
 */
export async function disconnect(by?: ActorRef): Promise<{ revoked: boolean }> {
  const token = readToken();
  let revoked = false;
  try {
    if (token) {
      const meta = await oauthMeta();
      if (meta.revocation_endpoint) {
        const ok: boolean[] = [];
        for (const [value, hint] of [
          [token.refresh_token, 'refresh_token'],
          [token.access_token, 'access_token'],
        ] as const) {
          if (!value) continue;
          const res = await fetch(meta.revocation_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: value, token_type_hint: hint, client_id: token.client_id }),
          });
          ok.push(res.ok);
        }
        revoked = ok.length > 0 && ok.every(Boolean);
      }
    }
  } catch {
    revoked = false;
  } finally {
    applyAccount(null); // đóng đề xuất chờ + tạm dừng Agent của shop
    deleteToken();
  }
  console.log(`[tiktok] Đã ngắt kết nối TikTok${by ? ` — bởi ${by.name}` : ''} lúc ${new Date().toISOString()} (TikTok thu hồi: ${revoked ? 'có' : 'chưa xác nhận'})`);
  return { revoked };
}

/** Chỉ dùng trong test */
export function resetPending() {
  pending.clear();
}
