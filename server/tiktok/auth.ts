import type { ActorRef } from '../../shared/permissions.js';
import { config } from '../config.js';
import { currentShopId } from '../shopContext.js';
import { clearLink, readTokenJson, writeTokenJson } from './link.js';

/** Token TikTok của 1 shop — lưu mã hoá trong database (tiktok_links), theo shop đang xử lý */
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

/** Thời gian chờ tối đa khi đọc cấu hình OAuth / gia hạn token */
const AUTH_TIMEOUT_MS = 30_000;

let metaCache: OAuthMeta | null = null;
export async function oauthMeta(): Promise<OAuthMeta> {
  if (!metaCache) {
    const res = await fetch(`${AUTH_BASE}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(AUTH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Không đọc được cấu hình OAuth TikTok (HTTP ${res.status})`);
    metaCache = (await res.json()) as OAuthMeta;
  }
  return metaCache;
}

/** Token của shop đang xử lý */
export function readToken(): StoredToken | null {
  return readTokenJson() as StoredToken | null;
}

/** Xoá kết nối của shop (Ngắt kết nối): token + tài khoản đang chọn */
export function deleteToken() {
  clearLink();
}

export function saveToken(token: Omit<StoredToken, 'savedAt'>) {
  writeTokenJson({ ...token, savedAt: new Date().toISOString() });
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
    // Gia hạn treo → mọi lời gọi của shop chờ chung 1 lần gia hạn mãi (refreshing) — giới hạn thời gian (28/11)
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
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
  writeTokenJson({ ...token, refreshFailedAt: new Date().toISOString() });
}

/** Đang gia hạn theo shop (nhiều lời gọi cùng lúc dùng chung 1 lần gia hạn) */
const refreshing = new Map<string, Promise<StoredToken>>();

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
  const shop = currentShopId();
  let job = refreshing.get(shop);
  if (!job) {
    job = refresh(token).finally(() => refreshing.delete(shop));
    refreshing.set(shop, job);
  }
  return (await job).access_token;
}
