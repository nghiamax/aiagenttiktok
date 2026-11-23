import { getDb } from './index.js';
import { importLegacy } from './importLegacy.js';

/**
 * Mở database lúc khởi động (server / npm run user): tạo bảng nếu chưa có + chép dữ liệu JSON cũ 1 lần.
 * Gọi trước khi nhận request. Lỗi chép → dừng hẳn (không chạy với dữ liệu thiếu).
 */
export function bootDatabase() {
  const db = getDb();
  const r = importLegacy(db);
  if (r.imported) {
    console.log(
      `[db] Đã chép dữ liệu cũ sang database: ${r.users} người dùng, ${r.accounts} tài khoản, ${r.shops} shop, ` +
        `${r.proposals} đề xuất, ${r.actions} nhật ký, ${r.watch} video theo dõi${r.token ? ', kết nối TikTok' : ''}`,
    );
  }
  return db;
}
