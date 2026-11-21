import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function list(value: string | undefined, fallback: string[]): string[] {
  return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : fallback;
}

/** Địa chỉ web công khai trên VPS (vd https://ads.tenmien.vn), không có dấu / cuối */
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/+$/, '') || null;

/** Cấu hình server, đọc từ biến môi trường (có giá trị mặc định để chạy trên máy) */
export const config = {
  root: ROOT,
  port: Number(process.env.PORT ?? 8787),
  /** Mặc định chỉ nghe trên máy này. Trên VPS vẫn để 127.0.0.1 — Caddy (HTTPS) đứng trước chuyển vào. */
  host: process.env.HOST ?? '127.0.0.1',
  /** Token TikTok (không commit) */
  secretsDir: path.resolve(ROOT, process.env.SECRETS_DIR ?? '.secrets'),
  /** Cache số liệu + bảng username tác giả (không commit) */
  dataDir: path.resolve(ROOT, process.env.DATA_DIR ?? 'server-data'),
  /** Trang web được phép gọi API */
  allowedOrigins: [
    ...new Set([...list(process.env.ALLOWED_ORIGINS, ['http://localhost:5173', 'http://127.0.0.1:5173']), ...(PUBLIC_URL ? [PUBLIC_URL] : [])]),
  ],
  /** Địa chỉ trang web công khai (vd https://admin.tenmien.vn) — TikTok trả về đây khi bấm Kết nối TikTok. Trống = origin trang đang mở */
  publicUrl: PUBLIC_URL,
  /** Cookie đăng nhập chỉ gửi qua HTTPS — bật (COOKIE_SECURE=1) khi chạy sau HTTPS */
  cookieSecure: process.env.COOKIE_SECURE === '1',
  /** Đứng sau reverse proxy (Caddy/Nginx) → lấy IP thật từ X-Forwarded-For để chống dò mật khẩu */
  trustProxy: process.env.TRUST_PROXY === '1',
  tiktok: {
    mcpUrl: process.env.TIKTOK_MCP_URL ?? 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-flat',
    advertiserId: process.env.TIKTOK_ADVERTISER_ID ?? '7579465349544869906',
    storeId: process.env.TIKTOK_STORE_ID ?? '7496093946365052968',
    advertiserName: process.env.TIKTOK_ADVERTISER_NAME ?? 'Phụ Kiện NECOTECH',
    currency: 'VND',
  },
};
