import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

/* Chốt chặn an toàn: chỉ tool đọc, Tự chạy bị khoá */

describe('Chỉ gọi tool ĐỌC của TikTok', () => {
  it('READ_TOOLS không có tool tạo / sửa / xoá', async () => {
    const { READ_TOOLS } = await import('../server/tiktok/mcpClient');
    for (const t of READ_TOOLS) expect(t).not.toMatch(/update|create|delete|status|session|authoriz/i);
  });

  it('gọi tool ghi → bị chặn trước khi gửi đi (không có request mạng nào)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { callReadTool } = await import('../server/tiktok/mcpClient');
    for (const tool of ['gmv_max_creative_update', 'campaign_gmv_max_update', 'campaign_gmv_max_session_create']) {
      // @ts-expect-error — cố tình truyền tool ngoài danh sách
      await expect(callReadTool(tool, {})).rejects.toThrow('không nằm trong danh sách tool đọc');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('server không import tool ghi ở đâu cả', () => {
    const root = path.resolve(__dirname, '..', 'server');
    const files = fs.readdirSync(root, { recursive: true }).map(String).filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      // Bỏ chú thích (có ghi chú nhắc tên tool ghi để cấm) → chỉ xét code chạy thật
      const src = fs
        .readFileSync(path.join(root, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/gmv_max_creative_update|campaign_gmv_max_update|campaign_gmv_max_session_create/);
    }
  });
});

describe('Tự chạy bị khoá (mọi việc cần Sếp duyệt)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-test-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('AUTO_MODE_ENABLED = false', async () => {
    const { AUTO_MODE_ENABLED } = await import('../shared/agentPolicy');
    expect(AUTO_MODE_ENABLED).toBe(false);
  });

  it('server lưu quy tắc "auto" thành "approve"', async () => {
    vi.stubEnv('DATA_DIR', dir);
    vi.resetModules();
    const store = await import('../server/store');
    const base = store.getAgentConfig();
    const saved = store.saveAgentConfig({
      rules: [...base.rules.map((r) => ({ ...r, mode: 'auto' as const })), { ...base.rules[0], id: 'my-rule', custom: true, mode: 'auto' as const }],
    });
    expect(saved.rules.every((r) => r.mode !== 'auto')).toBe(true);
    expect(saved.rules.find((r) => r.id === 'my-rule')?.mode).toBe('approve');
    // file ghi vào thư mục tạm, không đụng server-data thật
    expect(fs.existsSync(path.join(dir, 'agent-config.json'))).toBe(true);
    vi.unstubAllEnvs();
  });
});
