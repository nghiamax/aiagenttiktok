/**
 * Lược đồ SQLite theo phiên bản (Sếp chốt 23/11: SQLite, 1 tài khoản khách có 1 hoặc nhiều shop).
 * Chỉ THÊM phiên bản mới vào cuối — không sửa phiên bản đã chạy trên hosting.
 */
export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      -- Khách mua gói (1 tài khoản có thể có nhiều shop)
      CREATE TABLE accounts (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        plan        TEXT NOT NULL DEFAULT 'free',
        pro_until   TEXT,
        created_at  TEXT NOT NULL
      );

      -- Người đăng nhập web; account_id NULL = Quản trị nền tảng không thuộc khách nào
      CREATE TABLE users (
        id                   TEXT PRIMARY KEY,
        account_id           TEXT REFERENCES accounts(id) ON DELETE CASCADE,
        username             TEXT NOT NULL UNIQUE,
        name                 TEXT NOT NULL,
        role                 TEXT NOT NULL,
        is_admin             INTEGER NOT NULL DEFAULT 0,
        password_hash        TEXT NOT NULL,
        disabled             INTEGER NOT NULL DEFAULT 0,
        created_at           TEXT NOT NULL,
        password_changed_at  TEXT NOT NULL,
        data                 TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX users_account ON users(account_id);

      -- Shop của khách: mỗi shop có kết nối TikTok + dữ liệu ADS riêng
      CREATE TABLE shops (
        id          TEXT PRIMARY KEY,
        account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        created_at  TEXT NOT NULL
      );
      CREATE INDEX shops_account ON shops(account_id);

      -- Phiên đăng nhập: chỉ lưu SHA-256 của token; shop_id = shop đang mở
      CREATE TABLE sessions (
        token_hash  TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        shop_id     TEXT REFERENCES shops(id) ON DELETE SET NULL,
        created_at  TEXT NOT NULL,
        expires_at  TEXT NOT NULL
      );
      CREATE INDEX sessions_user ON sessions(user_id);

      -- Kết nối TikTok của shop: token mã hoá (AES-256-GCM) + tài khoản quảng cáo / shop TikTok đang chọn
      CREATE TABLE tiktok_links (
        shop_id            TEXT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
        token_enc          TEXT,
        connected_at       TEXT,
        connected_by       TEXT,
        refreshed_at       TEXT,
        refresh_failed_at  TEXT,
        advertiser_id      TEXT,
        advertiser_name    TEXT,
        store_id           TEXT,
        store_name         TEXT,
        currency           TEXT
      );

      -- Dữ liệu ADS theo shop (JSON trong cột data — giữ nguyên kiểu đang dùng trong code)
      CREATE TABLE shop_settings (
        shop_id  TEXT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
        data     TEXT NOT NULL
      );
      CREATE TABLE agent_config (
        shop_id  TEXT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
        data     TEXT NOT NULL
      );
      -- lastRunAt / lastRunError … của Agent theo shop
      CREATE TABLE agent_runtime (
        shop_id  TEXT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
        data     TEXT NOT NULL
      );
      CREATE TABLE proposals (
        id          TEXT NOT NULL,
        shop_id     TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        status      TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        data        TEXT NOT NULL,
        PRIMARY KEY (shop_id, id)
      );
      CREATE INDEX proposals_shop_status ON proposals(shop_id, status);
      CREATE TABLE actions (
        id           TEXT NOT NULL,
        shop_id      TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        status       TEXT NOT NULL,
        executed_at  TEXT NOT NULL,
        data         TEXT NOT NULL,
        PRIMARY KEY (shop_id, id)
      );
      CREATE INDEX actions_shop_time ON actions(shop_id, executed_at);
      CREATE TABLE watchlist (
        shop_id   TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        video_id  TEXT NOT NULL,
        note      TEXT,
        added_at  TEXT NOT NULL,
        added_by  TEXT,
        PRIMARY KEY (shop_id, video_id)
      );
    `,
  },
  {
    version: 2,
    sql: `
      -- Cờ hệ thống (vd đã chép dữ liệu JSON cũ sang database chưa)
      CREATE TABLE meta (
        key    TEXT PRIMARY KEY,
        value  TEXT NOT NULL
      );
    `,
  },
  {
    version: 3,
    sql: `
      -- Thứ tự đề xuất / nhật ký như danh sách trong code (0 = mới nhất)
      ALTER TABLE proposals ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE actions ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX proposals_shop_seq ON proposals(shop_id, seq);
      CREATE INDEX actions_shop_seq ON actions(shop_id, seq);
    `,
  },
];
