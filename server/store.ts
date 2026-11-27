import fs from 'node:fs';
import path from 'node:path';
import { normalizeSettings, type AdsSettings } from '../shared/settings.js';
import type { AgentActionLog, AgentConfig, AgentProposal, AgentRuntime, AgentState } from '../shared/agentTypes.js';
import { AUTO_MODE_ENABLED } from '../shared/agentPolicy.js';
import { isLegacyCampaignRule } from '../shared/campaignTune.js';
import { config } from './config.js';
import { getDb, parseJson, tx } from './db/index.js';
import { currentShopId } from './shopContext.js';

/*
 * Thiết lập + dữ liệu Agent THEO SHOP (database: shop_settings, agent_config, agent_runtime, proposals, actions).
 * Shop lấy từ `currentShopId()` (middleware requireShop / vòng lặp lịch Agent) — không có shop thì báo lỗi.
 * Mặc định lấy từ src/data/.
 */

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

const DEFAULT_SETTINGS = readJson<AdsSettings>(path.join(config.root, 'src', 'data', 'ads-settings.json'))!;
const DEFAULT_AGENT = readJson<AgentState>(path.join(config.root, 'src', 'data', 'agent.json'))!;

/** Đọc / ghi 1 bảng dạng (shop_id, data JSON) */
function readRow(table: 'shop_settings' | 'agent_config' | 'agent_runtime', shopId = currentShopId()): unknown | null {
  const r = getDb().prepare(`SELECT data FROM ${table} WHERE shop_id = ?`).get(shopId) as { data: string } | undefined;
  return r ? parseJson(r.data, null) : null;
}
function writeRow(table: 'shop_settings' | 'agent_config' | 'agent_runtime', data: unknown, shopId = currentShopId()) {
  getDb()
    .prepare(`INSERT INTO ${table} (shop_id, data) VALUES (?, ?) ON CONFLICT(shop_id) DO UPDATE SET data = excluded.data`)
    .run(shopId, JSON.stringify(data));
}

/* ───────── Thiết lập phân loại ───────── */

export function settingsStored(): boolean {
  return readRow('shop_settings') !== null;
}

export function getSettings(): AdsSettings {
  return normalizeSettings(readRow('shop_settings') as Partial<AdsSettings> | null, DEFAULT_SETTINGS);
}

export function saveSettings(next: Partial<AdsSettings>): AdsSettings {
  const settings = normalizeSettings(next, DEFAULT_SETTINGS);
  writeRow('shop_settings', settings);
  return settings;
}

/* ───────── Cấu hình Agent (chủ shop chỉnh) ───────── */

export function agentConfigStored(): boolean {
  return readRow('agent_config') !== null;
}

/** Ghép bản lưu với mặc định: giữ quy tắc mẫu theo file mặc định + phần đã chỉnh, nối quy tắc tự tạo */
export function normalizeAgentConfig(saved: Partial<AgentConfig> | null): AgentConfig {
  const savedRules = new Map((saved?.rules ?? []).map((r) => [r.id, r]));
  const defaultIds = new Set(DEFAULT_AGENT.rules.map((r) => r.id));
  return {
    paused: saved?.paused ?? DEFAULT_AGENT.paused,
    rules: [
      ...DEFAULT_AGENT.rules.map((r) => {
        const s = savedRules.get(r.id);
        return s ? { ...r, ...s, params: { ...r.params, ...s.params }, custom: false } : r;
      }),
      ...(saved?.rules ?? []).filter((r) => r.custom && !defaultIds.has(r.id)),
    ]
      .map((r) => (!AUTO_MODE_ENABLED && r.mode === 'auto' ? { ...r, mode: 'approve' as const } : r))
      // Quy tắc chiến dịch theo nhóm cũ: đã thay bằng BOT chỉnh ROI & ngân sách (Sếp chốt 26/11) → luôn Tắt
      .map((r) => (isLegacyCampaignRule(r) && r.mode !== 'off' ? { ...r, mode: 'off' as const } : r)),
    guardrails: { ...DEFAULT_AGENT.guardrails, ...saved?.guardrails },
  };
}

export function getAgentConfig(): AgentConfig {
  return normalizeAgentConfig(readRow('agent_config') as Partial<AgentConfig> | null);
}

export function saveAgentConfig(next: Partial<AgentConfig>): AgentConfig {
  const cfg = normalizeAgentConfig({ ...getAgentConfig(), ...next });
  writeRow('agent_config', cfg);
  return cfg;
}

/** Về mặc định (xoá cả quy tắc tự tạo), giữ trạng thái tạm dừng */
export function resetAgentConfig(): AgentConfig {
  const cfg = normalizeAgentConfig({ paused: getAgentConfig().paused });
  writeRow('agent_config', cfg);
  return cfg;
}

/* ───────── Dữ liệu Agent tự ghi ───────── */

function readRuntime(shopId: string): AgentRuntime {
  const db = getDb();
  const head = (readRow('agent_runtime', shopId) ?? {}) as Partial<AgentRuntime>;
  const rows = (table: 'proposals' | 'actions') =>
    (db.prepare(`SELECT data FROM ${table} WHERE shop_id = ? ORDER BY seq`).all(shopId) as { data: string }[]).map((r) => parseJson(r.data, null)).filter(Boolean);
  return {
    lastRunAt: head.lastRunAt ?? null,
    lastRunError: head.lastRunError ?? null,
    lastRunTrigger: head.lastRunTrigger ?? null,
    lastRunVersion: head.lastRunVersion ?? null,
    proposals: rows('proposals') as unknown as AgentProposal[],
    actions: rows('actions') as unknown as AgentActionLog[],
  };
}

/** Ghi lại toàn bộ danh sách (thứ tự = seq). Tối đa 2000 dòng mỗi loại nên ghi lại cả bảng vẫn nhanh. */
function writeRuntime(shopId: string, rt: AgentRuntime) {
  const db = getDb();
  writeRow(
    'agent_runtime',
    { lastRunAt: rt.lastRunAt ?? null, lastRunError: rt.lastRunError ?? null, lastRunTrigger: rt.lastRunTrigger ?? null, lastRunVersion: rt.lastRunVersion ?? null },
    shopId,
  );
  db.prepare('DELETE FROM proposals WHERE shop_id = ?').run(shopId);
  const insP = db.prepare('INSERT OR REPLACE INTO proposals (id, shop_id, status, created_at, data, seq) VALUES (?, ?, ?, ?, ?, ?)');
  rt.proposals.forEach((p, i) => insP.run(p.id, shopId, p.status, p.createdAt, JSON.stringify(p), i));
  db.prepare('DELETE FROM actions WHERE shop_id = ?').run(shopId);
  const insA = db.prepare('INSERT OR REPLACE INTO actions (id, shop_id, status, executed_at, data, seq) VALUES (?, ?, ?, ?, ?, ?)');
  rt.actions.forEach((a, i) => insA.run(a.id, shopId, a.status, a.executedAt, JSON.stringify(a), i));
}

export function getRuntime(): AgentRuntime {
  return readRuntime(currentShopId());
}

/**
 * Sửa dữ liệu Agent trong 1 bước (đọc → sửa → ghi) trong 1 transaction IMMEDIATE —
 * nhiều tiến trình Passenger cũng không ghi đè lẫn nhau.
 */
export function updateRuntime(fn: (r: AgentRuntime) => AgentRuntime | void): AgentRuntime {
  const shopId = currentShopId();
  const db = getDb();
  return tx(db, () => {
    const current = readRuntime(shopId);
    const next = fn(current) ?? current;
    writeRuntime(shopId, next);
    return next;
  });
}

export function getAgentState(): AgentState {
  return { ...getAgentConfig(), ...getRuntime() };
}
