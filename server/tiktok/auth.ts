import fs from 'node:fs';
import path from 'node:path';
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
  savedAt: string;
}

export class TikTokLoginRequired extends Error {
  constructor(message = 'Chưa đăng nhập TikTok hoặc phiên đã hết hạn — chạy: npm run login') {
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
  } catch {
    throw new TikTokLoginRequired('Không gia hạn được phiên TikTok — chạy lại: npm run login');
  }
}

/** Lấy access token còn hạn (tự gia hạn nếu sắp hết). force = gia hạn ngay (khi TikTok báo 401). */
export async function getAccessToken(force = false): Promise<string> {
  const token = readToken();
  if (!token?.access_token) throw new TikTokLoginRequired();
  const exp = expiresAt(token);
  if (!force && (exp === null || exp - Date.now() > REFRESH_MARGIN_MS)) return token.access_token;
  refreshing ??= refresh(token).finally(() => {
    refreshing = null;
  });
  return (await refreshing).access_token;
}
