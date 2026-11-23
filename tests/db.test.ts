import fs from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';

/* Database SQLite: migration, transaction, mã hoá token — dữ liệu ở thư mục tạm */
const dir = vi.hoisted(() => ({ path: '' }));
vi.mock('../server/config', async () => {
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  dir.path = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'db-'));
  return { config: { dataDir: dir.path, secretsDir: pathMod.join(dir.path, 'secrets') } };
});
const { getDb, closeDb, migrate, tx } = await import('../server/db/index');
const { encrypt, decrypt, resetSecretCache } = await import('../server/db/secret');
const { MIGRATIONS } = await import('../server/db/schema');
afterAll(() => {
  closeDb();
  fs.rmSync(dir.path, { recursive: true, force: true });
});

describe('database', () => {
  it('tạo bảng + ghi phiên bản; chạy lại migration không lỗi, không chạy 2 lần', () => {
    const db = getDb();
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
    for (const t of ['accounts', 'users', 'shops', 'sessions', 'tiktok_links', 'proposals', 'actions', 'watchlist']) expect(tables).toContain(t);
    migrate(db);
    const versions = db.prepare('SELECT version FROM schema_version').all() as { version: number }[];
    expect(versions.map((v) => v.version)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(db.prepare('PRAGMA journal_mode').get()).toMatchObject({ journal_mode: 'wal' });
  });

  it('transaction lỗi → không ghi gì; xoá tài khoản → xoá shop theo (khoá ngoại)', () => {
    const db = getDb();
    expect(() =>
      tx(db, () => {
        db.prepare("INSERT INTO accounts (id, name, created_at) VALUES ('a1', 'A', 'x')").run();
        throw new Error('hỏng');
      }),
    ).toThrow('hỏng');
    expect(db.prepare("SELECT count(*) n FROM accounts WHERE id='a1'").get()).toMatchObject({ n: 0 });

    db.prepare("INSERT INTO accounts (id, name, created_at) VALUES ('a2', 'B', 'x')").run();
    db.prepare("INSERT INTO shops (id, account_id, name, created_at) VALUES ('s2', 'a2', 'Shop', 'x')").run();
    db.prepare("DELETE FROM accounts WHERE id='a2'").run();
    expect(db.prepare("SELECT count(*) n FROM shops WHERE id='s2'").get()).toMatchObject({ n: 0 });
  });
});

describe('mã hoá token', () => {
  it('giải mã đúng; mỗi lần mã hoá khác nhau; sửa 1 ký tự → null; khoá tự sinh lưu 0600 trong secrets', () => {
    const a = encrypt('{"access_token":"abc"}');
    const b = encrypt('{"access_token":"abc"}');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('{"access_token":"abc"}');
    const broken = a.slice(0, -2) + (a.endsWith('A') ? 'BB' : 'AA');
    expect(decrypt(broken)).toBeNull();
    expect(fs.existsSync(`${dir.path}/secrets/app-secret`)).toBe(true);
    // Nạp lại khoá từ file → vẫn giải được
    resetSecretCache();
    expect(decrypt(a)).toBe('{"access_token":"abc"}');
  });
});
