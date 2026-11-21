import fs from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';

/* Triển khai trên hosting: hàng rào thư mục web công khai + khoá chạy lịch Agent 1 tiến trình */
const dir = vi.hoisted(() => ({ path: '' }));
vi.mock('../server/config', async (orig) => {
  const real = await orig<typeof import('../server/config')>();
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  dir.path = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'lock-'));
  return { ...real, config: { ...real.config, dataDir: dir.path } };
});

const { unsafeDirReason } = await import('../server/config');
const { holdSchedulerLock, LOCK_TTL_MS } = await import('../server/agent/leaderLock');
afterAll(() => fs.rmSync(dir.path, { recursive: true, force: true }));

describe('Hàng rào thư mục web công khai (sự cố 21/11)', () => {
  it('chìa khoá / dữ liệu trong public_html, www, htdocs → từ chối', () => {
    expect(unsafeDirReason({ secretsDir: '/home/necomaxc/public_html/tool/.secrets', dataDir: '/home/necomaxc/tiktok-admin/server-data' })).toMatch(/secretsDir/);
    expect(unsafeDirReason({ secretsDir: '/home/a/tiktok-admin/.secrets', dataDir: '/var/www/app/server-data' })).toMatch(/dataDir/);
    expect(unsafeDirReason({ secretsDir: 'C:\\xampp\\htdocs\\app\\.secrets', dataDir: 'C:\\app\\server-data' })).not.toBeNull();
  });

  it('ngoài thư mục web → an toàn (kể cả tên có chữ www ở giữa)', () => {
    expect(unsafeDirReason({ secretsDir: '/home/necomaxc/tiktok-admin/.secrets', dataDir: '/home/necomaxc/tiktok-admin/server-data' })).toBeNull();
    expect(unsafeDirReason({ secretsDir: '/opt/tiktok-admin/.secrets', dataDir: '/opt/wwwdata/server-data' })).toBeNull();
    expect(unsafeDirReason({ secretsDir: 'D:\\CODE\\aiagenttiktok\\.secrets', dataDir: 'D:\\CODE\\aiagenttiktok\\server-data' })).toBeNull();
  });
});

describe('Khoá chạy lịch Agent (nhiều tiến trình trên cPanel)', () => {
  it('tiến trình A giữ khoá → B không chạy; A ngừng làm mới quá hạn → B lấy lại', () => {
    const t = 1_000_000;
    expect(holdSchedulerLock(t, 'A')).toBe(true);
    expect(holdSchedulerLock(t + 1000, 'B')).toBe(false);
    expect(holdSchedulerLock(t + 60_000, 'A')).toBe(true); // A làm mới
    expect(holdSchedulerLock(t + 60_000 + LOCK_TTL_MS - 1, 'B')).toBe(false);
    expect(holdSchedulerLock(t + 60_000 + LOCK_TTL_MS, 'B')).toBe(true); // A đã tắt
    expect(holdSchedulerLock(t + 60_000 + LOCK_TTL_MS + 1, 'A')).toBe(false);
  });
});
