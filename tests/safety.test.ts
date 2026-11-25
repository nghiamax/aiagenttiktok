import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

/* Chốt chặn an toàn: chỉ tool đọc; "BOT chạy" chỉ mở qua AUTO_MODE_ENABLED (Sếp mở 25/11) */

describe('Chỉ gọi tool ĐỌC của TikTok', () => {
  it('READ_TOOLS không có tool tạo / sửa / xoá', async () => {
    const { READ_TOOLS } = await import('../server/tiktok/mcpClient');
    for (const t of READ_TOOLS) expect(t).not.toMatch(/update|create|delete|status|session|authoriz/i);
  });

  it('MCP bản flat gọi thẳng tool theo tên; bản layer đi qua tool_execute', async () => {
    const { mcpCallArgs, isFlatMcp } = await import('../server/tiktok/mcpClient');
    const { config } = await import('../server/config');
    expect(isFlatMcp(config.tiktok.mcpUrl)).toBe(true);
    const params = { advertiser_id: '1' };
    expect(mcpCallArgs('gmv_max_report_get', params, 'https://x/open_mcp/tt-ads-mcp-flat')).toEqual({
      name: 'gmv_max_report_get',
      args: params,
    });
    expect(mcpCallArgs('gmv_max_report_get', params, 'https://x/open_mcp/tt-ads-mcp-layer')).toEqual({
      name: 'tool_execute',
      args: { tool_name: 'gmv_max_report_get', params },
    });
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

  it('tool ghi chỉ nằm trong writeTools.ts / executor.ts; chỉ executor gọi callWriteTool', () => {
    const root = path.resolve(__dirname, '..', 'server');
    const files = fs.readdirSync(root, { recursive: true }).map(String).filter((f) => f.endsWith('.ts'));
    const norm = (f: string) => f.replace(/\\/g, '/');
    const WRITE_HOME = ['tiktok/writeTools.ts', 'agent/executor.ts'];
    for (const f of files) {
      // Bỏ chú thích (có ghi chú nhắc tên tool ghi) → chỉ xét code chạy thật
      const src = fs
        .readFileSync(path.join(root, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      if (!WRITE_HOME.includes(norm(f))) {
        expect(src, f).not.toMatch(/gmv_max_creative_update|campaign_gmv_max_update|campaign_gmv_max_session_create/);
        expect(src, f).not.toMatch(/callWriteTool/);
      }
      // callWithRetry (gọi tool bất kỳ) chỉ dùng trong mcpClient + writeTools
      if (!['tiktok/mcpClient.ts', 'tiktok/writeTools.ts'].includes(norm(f))) {
        expect(src, f).not.toMatch(/callWithRetry/);
      }
    }
  });

  it('WRITE_TOOLS đúng 3 tool; tool lạ bị chặn trước khi gửi', async () => {
    const { WRITE_TOOLS, callWriteTool } = await import('../server/tiktok/writeTools');
    expect([...WRITE_TOOLS].sort()).toEqual(
      ['campaign_gmv_max_session_create', 'campaign_gmv_max_update', 'gmv_max_creative_update'].sort(),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    // @ts-expect-error — cố tình truyền tool ngoài danh sách
    await expect(callWriteTool('campaign_gmv_max_delete', {})).rejects.toThrow('không nằm trong danh sách tool ghi');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('Duyệt phải có confirm: true (route chặn trước khi chạy)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'server', 'routes', 'agent.ts'), 'utf8');
    const approve = src.slice(src.indexOf("'/proposals/:id/approve'"), src.indexOf("'/proposals/:id/reject'"));
    expect(approve.indexOf('confirm !== true')).toBeGreaterThan(-1);
    expect(approve.indexOf('confirm !== true')).toBeLessThan(approve.indexOf('executeProposal'));
    const undo = src.slice(src.indexOf("'/actions/:id/undo'"));
    expect(undo.indexOf('confirm !== true')).toBeLessThan(undo.indexOf('undoAction'));
    const manual = src.slice(src.indexOf("'/actions/manual'"));
    expect(manual.indexOf('confirm !== true')).toBeGreaterThan(-1);
    expect(manual.indexOf('confirm !== true')).toBeLessThan(manual.indexOf('executeManual('));
  });
});

describe('BOT chạy (Sếp mở 25/11/2026)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-test-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('AUTO_MODE_ENABLED = true', async () => {
    const { AUTO_MODE_ENABLED } = await import('../shared/agentPolicy');
    expect(AUTO_MODE_ENABLED).toBe(true);
  });

  it('server giữ quy tắc "BOT chạy" khi lưu (không ép về Cần duyệt)', async () => {
    vi.stubEnv('DATA_DIR', dir);
    vi.resetModules();
    const store = await import('../server/store');
    const { withShop } = await import('../server/shopContext');
    const { makeShop } = await import('./shopHelper');
    const saved = withShop(makeShop(), () => {
      const base = store.getAgentConfig();
      return store.saveAgentConfig({
        rules: [...base.rules.map((r) => ({ ...r, mode: 'auto' as const })), { ...base.rules[0], id: 'my-rule', custom: true, mode: 'auto' as const }],
      });
    });
    expect(saved.rules.every((r) => r.mode === 'auto')).toBe(true);
    expect(saved.rules.find((r) => r.id === 'my-rule')?.mode).toBe('auto');
    // database ghi vào thư mục tạm, không đụng server-data thật
    expect(fs.existsSync(path.join(dir, 'app.db'))).toBe(true);
    (await import('../server/db/index')).closeDb();
    vi.unstubAllEnvs();
  });
});

describe('BOT chạy bị khoá khi AUTO_MODE_ENABLED = false', () => {
  it('server ép quy tắc "auto" về "approve"', async () => {
    vi.resetModules();
    vi.doMock('../shared/agentPolicy', async (orig) => ({ ...(await orig<object>()), AUTO_MODE_ENABLED: false }));
    const { normalizeAgentConfig } = await import('../server/store');
    const cfg = normalizeAgentConfig({ rules: [{ id: 'x', custom: true, mode: 'auto' } as never] });
    expect(cfg.rules.find((r) => r.id === 'x')?.mode).toBe('approve');
    vi.doUnmock('../shared/agentPolicy');
    vi.resetModules();
  });
});
