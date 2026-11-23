import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { tx, type Db } from './index.js';
import { encrypt } from './secret.js';

/*
 * Chép dữ liệu JSON cũ (1 shop NECOTECH dùng chung) sang database nhiều shop — chạy 1 lần (cờ meta 'legacy_import').
 * Không xoá / đổi tên file cũ: bản code cũ vẫn đọc được nếu phải quay lại.
 *
 * Ánh xạ vai trò cũ → mới:
 *  - owner (Quản trị viên)  → Quản trị nền tảng (is_admin) + chủ tài khoản "chính" (shop hiện tại)
 *  - staff (Nhân viên)      → nhân viên tài khoản chính
 *  - user  (Người dùng)     → mỗi người 1 tài khoản khách riêng (chưa có shop), gói / hạn Pro chuyển sang tài khoản
 */

export const LEGACY_FLAG = 'legacy_import';
const SESSION_TTL_MS = 30 * 24 * 3_600_000;

interface LegacyUser {
  id: string;
  username: string;
  name: string;
  role: string;
  plan?: string;
  proUntil?: string | null;
  passwordHash: string;
  disabled?: boolean;
  createdAt?: string;
  passwordChangedAt?: string;
  [k: string]: unknown;
}
interface LegacySession {
  idHash: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
}
interface LegacyToken {
  connectedAt?: string;
  connectedBy?: unknown;
  savedAt?: string;
  refreshFailedAt?: string;
  [k: string]: unknown;
}

export interface ImportResult {
  imported: boolean;
  /** Lý do bỏ qua (đã chép / không có dữ liệu cũ) */
  skipped?: string;
  accounts: number;
  users: number;
  shops: number;
  sessions: number;
  proposals: number;
  actions: number;
  watch: number;
  token: boolean;
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

const id = () => crypto.randomUUID();
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Chép nếu chưa chép. Nhiều tiến trình cùng gọi: transaction IMMEDIATE + kiểm tra cờ bên trong → chỉ 1 lần. */
export function importLegacy(db: Db, now = new Date()): ImportResult {
  const empty: ImportResult = { imported: false, accounts: 0, users: 0, shops: 0, sessions: 0, proposals: 0, actions: 0, watch: 0, token: false };
  const data = (n: string) => path.join(config.dataDir, n);
  const users = arr<LegacyUser>(readJson(data('users.json')));
  const tokenFile = path.join(config.secretsDir, 'tiktok-mcp.json');
  const token = readJson<LegacyToken>(tokenFile);
  const hasShopData = ['settings.json', 'agent-config.json', 'agent-state.json', 'watchlist.json'].some((f) => fs.existsSync(data(f)));

  return tx(db, () => {
    if (db.prepare('SELECT 1 FROM meta WHERE key = ?').get(LEGACY_FLAG)) return { ...empty, skipped: 'đã chép trước đó' };
    const iso = now.toISOString();
    const markDone = (r: ImportResult) => {
      db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(LEGACY_FLAG, JSON.stringify({ at: iso, ...r }));
      return r;
    };
    if (users.length === 0 && !token && !hasShopData) return markDone({ ...empty, skipped: 'không có dữ liệu cũ' });

    const r: ImportResult = { ...empty, imported: true };
    const insAccount = db.prepare('INSERT INTO accounts (id, name, plan, pro_until, created_at) VALUES (?, ?, ?, ?, ?)');
    const insUser = db.prepare(
      `INSERT INTO users (id, account_id, username, name, role, is_admin, password_hash, disabled, created_at, password_changed_at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    // Tài khoản chính = shop đang chạy (NECOTECH) — chủ là các Quản trị viên cũ
    const mainAccount = id();
    const mainName = config.tiktok.advertiserName || 'Shop chính';
    insAccount.run(mainAccount, mainName, 'free', null, iso); // Quản trị viên luôn dùng như Pro (effectivePlan)
    r.accounts++;
    const mainShop = id();
    db.prepare('INSERT INTO shops (id, account_id, name, created_at) VALUES (?, ?, ?, ?)').run(mainShop, mainAccount, mainName, iso);
    r.shops++;

    const accountOf = new Map<string, string>();
    for (const u of users) {
      if (!u?.id || !u.username || !u.passwordHash) continue;
      const { id: _id, username, name, role, passwordHash, disabled, createdAt, passwordChangedAt, ...rest } = u;
      let accountId = mainAccount;
      let newRole = 'staff';
      let admin = 0;
      if (role === 'owner') {
        newRole = 'owner';
        admin = 1;
      } else if (role === 'user') {
        // Khách cũ: tài khoản riêng, mang gói theo
        accountId = id();
        insAccount.run(accountId, name || username, u.plan === 'pro' ? 'pro' : 'free', u.proUntil ?? null, createdAt ?? iso);
        r.accounts++;
        newRole = 'owner';
      }
      accountOf.set(u.id, accountId);
      insUser.run(
        u.id,
        accountId,
        username.trim().toLowerCase(),
        name || username,
        newRole,
        admin,
        passwordHash,
        disabled ? 1 : 0,
        createdAt ?? iso,
        passwordChangedAt ?? createdAt ?? iso,
        JSON.stringify({ legacyRole: role, ...rest }),
      );
      r.users++;
    }

    // Phiên còn hạn: giữ đăng nhập; người thuộc tài khoản chính mở sẵn shop chính
    const insSession = db.prepare('INSERT OR IGNORE INTO sessions (token_hash, user_id, shop_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)');
    for (const s of arr<LegacySession>(readJson(data('sessions.json')))) {
      const acc = accountOf.get(s?.userId);
      if (!acc || !s.idHash) continue;
      const expires = Date.parse(s.lastSeenAt) + SESSION_TTL_MS;
      if (!Number.isFinite(expires) || expires <= now.getTime()) continue;
      insSession.run(s.idHash, s.userId, acc === mainAccount ? mainShop : null, s.createdAt ?? iso, new Date(expires).toISOString());
      r.sessions++;
    }

    // Kết nối TikTok của shop chính (token mã hoá) + tài khoản quảng cáo đang dùng
    if (token?.access_token) {
      db.prepare(
        `INSERT INTO tiktok_links (shop_id, token_enc, connected_at, connected_by, refreshed_at, refresh_failed_at,
           advertiser_id, advertiser_name, store_id, store_name, currency)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        mainShop,
        encrypt(JSON.stringify(token)),
        token.connectedAt ?? null,
        token.connectedBy ? JSON.stringify(token.connectedBy) : null,
        token.savedAt ?? null,
        token.refreshFailedAt ?? null,
        config.tiktok.advertiserId,
        config.tiktok.advertiserName,
        config.tiktok.storeId,
        null,
        config.tiktok.currency,
      );
      r.token = true;
    }

    // Dữ liệu ADS / Agent → shop chính
    const settings = readJson(data('settings.json'));
    if (settings) db.prepare('INSERT INTO shop_settings (shop_id, data) VALUES (?, ?)').run(mainShop, JSON.stringify(settings));
    const agentCfg = readJson(data('agent-config.json'));
    if (agentCfg) db.prepare('INSERT INTO agent_config (shop_id, data) VALUES (?, ?)').run(mainShop, JSON.stringify(agentCfg));
    const runtime = readJson<{ lastRunAt?: string; lastRunError?: string; proposals?: unknown; actions?: unknown }>(data('agent-state.json'));
    if (runtime) {
      db.prepare('INSERT INTO agent_runtime (shop_id, data) VALUES (?, ?)').run(
        mainShop,
        JSON.stringify({ lastRunAt: runtime.lastRunAt ?? null, lastRunError: runtime.lastRunError ?? null }),
      );
      const insP = db.prepare('INSERT OR REPLACE INTO proposals (id, shop_id, status, created_at, data, seq) VALUES (?, ?, ?, ?, ?, ?)');
      for (const p of arr<{ id: string; status: string; createdAt: string }>(runtime.proposals)) {
        if (!p?.id) continue;
        insP.run(p.id, mainShop, p.status ?? 'pending', p.createdAt ?? iso, JSON.stringify(p), r.proposals);
        r.proposals++;
      }
      const insA = db.prepare('INSERT OR REPLACE INTO actions (id, shop_id, status, executed_at, data, seq) VALUES (?, ?, ?, ?, ?, ?)');
      for (const a of arr<{ id: string; status: string; executedAt: string }>(runtime.actions)) {
        if (!a?.id) continue;
        insA.run(a.id, mainShop, a.status ?? 'success', a.executedAt ?? iso, JSON.stringify(a), r.actions);
        r.actions++;
      }
    }
    const insW = db.prepare('INSERT OR IGNORE INTO watchlist (shop_id, video_id, note, added_at, added_by) VALUES (?, ?, ?, ?, ?)');
    for (const w of arr<{ videoId: string; note?: string; addedAt?: string; addedBy?: unknown }>(readJson(data('watchlist.json')))) {
      if (!w?.videoId) continue;
      insW.run(mainShop, w.videoId, w.note ?? null, w.addedAt ?? iso, w.addedBy ? JSON.stringify(w.addedBy) : null);
      r.watch++;
    }

    return markDone(r);
  });
}
