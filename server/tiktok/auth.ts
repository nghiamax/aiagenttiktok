import fs from 'node:fs';
import path from 'node:path';
import type { ActorRef } from '../../shared/permissions.js';
import { config } from '../config.js';

/** File token, cùng định dạng với scripts/mcp-probe.mjs */
export interface StoredToken {
  client_id: string;
  redirect_uri?: string;
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  /** Lần lưu gần nhất (đăng nhập hoặc tự gia hạn) */
  savedAt: string;
  /** Lúc đăng nhập TikTok (npm run login / nút Kết nối TikTok) */
  connectedAt?: string;
  /** Người bấm Kết nối TikTok trên web */
  connectedBy?: ActorRef;
  /** TikTok từ chối gia hạn → phải kết nối lại (mất khi kết nối lại vì token bị ghi đè) */
  refreshFailedAt?: string;
}

export class TikTokLoginRequired extends Error {
  constructor(message = 'Chưa kết nối TikTok hoặc phiên đã hết hạn — bấm Kết nối TikTok trên web (hoặc chạy npm run login)') {
    super(message);
    this.name = 'TikTokLoginRequired';
  }
}

const TOKEN_FILE = path.join(config.secretsDir, 'tiktok-mcp.json');
const AUTH_BASE = `${config.tiktok.mcpUrl}/oauth`;
/** Gia hạn khi còn dưới 5 phút */
const REFRESH_MARGIN_MS = 5 * 60_000;

interface OAuthMeta {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  /** Thu hồi token (RFC 7009) — dùng khi Ngắt kết nối */
  revocation_endpoint?: string;
}

let metaCache: OAuthMeta | null = null;
export async function oauthMeta(): Promise<OAuthMeta> {
  if (!metaCache) {
    const res = await fetch(`${AUTH_BASE}/.well-known/oauth-authorization-server`);
    if (!res.ok) throw new Error(`Không đọc được cấu hình OAuth TikTok (HTTP ${res.status})`);
    metaCache = (await res.json()) as OAuthMeta;
  }
  return metaCache;
}

export function readToken(): StoredToken | null {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')) as StoredToken;
  } catch {
    return null;
  }
}

/** Xoá token trên máy (Ngắt kết nối) */
export function deleteToken() {
  fs.rmSync(TOKEN_FILE, { force: true });
}

export function saveToken(token: Omit<StoredToken, 'savedAt'>) {
  fs.mkdirSync(config.secretsDir, { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ ...token, savedAt: new Date().toISOString() }, null, 2), {
    mode: 0o600,
  });
}

/** Thời điểm token hết hạn (ms), null nếu không rõ */
export function expiresAt(token: StoredToken): number | null {
  if (!token.expires_in) return null;
  return Date.parse(token.savedAt) + token.expires_in * 1000;
}

export async function tokenRequest(params: Record<string, string>) {
  const meta = await oauthMeta();
  const res = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ resource: config.tiktok.mcpUrl, ...params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as Omit<StoredToken, 'savedAt' | 'client_id'>;
}

const REFRESH_FAILED_TEXT = 'TikTok không cho gia hạn nữa — bấm Kết nối TikTok trên web (hoặc chạy npm run login)';

/** Ghi lúc TikTok từ chối gia hạn (chỉ lần đầu, giữ nguyên savedAt) → biết hạn thật của quyền gia hạn */
function markRefreshFailed(token: StoredToken) {
  if (token.refreshFailedAt) return;
  console.warn('[tiktok] Gia hạn thất bại — cần Kết nối TikTok lại');
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ ...token, refreshFailedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
}

let refreshing: Promise<StoredToken> | null = null;

async function refresh(token: StoredToken): Promise<StoredToken> {
  if (!token.refresh_token) throw new TikTokLoginRequired();
  try {
    const next = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      client_id: token.client_id,
    });
    saveToken({ ...token, ...next });
    return readToken()!;
  } catch (e) {
    // Chỉ khi TikTok trả 4xx (từ chối) mới đánh dấu phải kết nối lại; lỗi mạng tạm thời thì lần sau thử tiếp
    if (/^HTTP 4\d\d/.test((e as Error).message)) {
      markRefreshFailed(token);
      throw new TikTokLoginRequired(REFRESH_FAILED_TEXT);
    }
    throw new Error(`Không gia hạn được phiên TikTok (lỗi mạng, sẽ thử lại): ${(e as Error).message.slice(0, 120)}`);
  }
}

/** Lấy access token còn hạn (tự gia hạn nếu sắp hết). force = gia hạn ngay (khi TikTok báo 401). */
export async function getAccessToken(force = false): Promise<string> {
  const token = readToken();
  if (!token?.access_token) throw new TikTokLoginRequired();
  if (token.refreshFailedAt) throw new TikTokLoginRequired(REFRESH_FAILED_TEXT);
  const exp = expiresAt(token);
  if (!force && (exp === null || exp - Date.now() > REFRESH_MARGIN_MS)) return token.access_token;
  refreshing ??= refresh(token).finally(() => {
    refreshing = null;
  });
  return (await refreshing).access_token;
}
