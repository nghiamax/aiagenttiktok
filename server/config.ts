import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function list(value: string | undefined, fallback: string[]): string[] {
  return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : fallback;
}

/** Cấu hình server, đọc từ biến môi trường (có giá trị mặc định để chạy trên máy) */
export const config = {
  root: ROOT,
  port: Number(process.env.PORT ?? 8787),
  /** Mặc định chỉ nghe trên máy này. Chưa có đăng nhập người dùng web → KHÔNG mở ra mạng ngoài. */
  host: process.env.HOST ?? '127.0.0.1',
  /** Token TikTok (không commit) */
  secretsDir: path.resolve(ROOT, process.env.SECRETS_DIR ?? '.secrets'),
  /** Cache số liệu + bảng username tác giả (không commit) */
  dataDir: path.resolve(ROOT, process.env.DATA_DIR ?? 'server-data'),
  /** Trang web được phép gọi API */
  allowedOrigins: list(process.env.ALLOWED_ORIGINS, ['http://localhost:5173', 'http://127.0.0.1:5173']),
  tiktok: {
    mcpUrl: process.env.TIKTOK_MCP_URL ?? 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-flat',
    advertiserId: process.env.TIKTOK_ADVERTISER_ID ?? '7579465349544869906',
    storeId: process.env.TIKTOK_STORE_ID ?? '7496093946365052968',
    advertiserName: process.env.TIKTOK_ADVERTISER_NAME ?? 'Phụ Kiện NECOTECH',
    currency: 'VND',
  },
};
