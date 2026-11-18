import fs from 'node:fs';
import path from 'node:path';
import { normalizeSettings, type AdsSettings } from '../shared/settings.js';
import type { AgentConfig, AgentRuntime, AgentState } from '../shared/agentTypes.js';
import { AUTO_MODE_ENABLED } from '../shared/agentPolicy.js';
import { config } from './config.js';

/* Lưu thiết lập + dữ liệu Agent vào server-data/*.json (không commit). Mặc định lấy từ src/data/. */

const file = (name: string) => path.join(config.dataDir, name);

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Ghi nguyên tử: ghi file tạm rồi đổi tên, tránh hỏng file khi đang ghi thì tắt server */
function writeJson(p: string, data: unknown) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

const DEFAULT_SETTINGS = readJson<AdsSettings>(path.join(config.root, 'src', 'data', 'ads-settings.json'))!;
const DEFAULT_AGENT = readJson<AgentState>(path.join(config.root, 'src', 'data', 'agent.json'))!;

/* ───────── Thiết lập phân loại ───────── */

const SETTINGS_FILE = file('settings.json');

export function settingsStored(): boolean {
  return fs.existsSync(SETTINGS_FILE);
}

export function getSettings(): AdsSettings {
  return normalizeSettings(readJson<Partial<AdsSettings>>(SETTINGS_FILE), DEFAULT_SETTINGS);
}

export function saveSettings(next: Partial<AdsSettings>): AdsSettings {
  const settings = normalizeSettings(next, DEFAULT_SETTINGS);
  writeJson(SETTINGS_FILE, settings);
  return settings;
}

/* ───────── Cấu hình Agent (Sếp chỉnh) ───────── */

const CONFIG_FILE = file('agent-config.json');

export function agentConfigStored(): boolean {
  return fs.existsSync(CONFIG_FILE);
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
    ].map((r) => (!AUTO_MODE_ENABLED && r.mode === 'auto' ? { ...r, mode: 'approve' as const } : r)),
    guardrails: { ...DEFAULT_AGENT.guardrails, ...saved?.guardrails },
  };
}

export function getAgentConfig(): AgentConfig {
  return normalizeAgentConfig(readJson<Partial<AgentConfig>>(CONFIG_FILE));
}

export function saveAgentConfig(next: Partial<AgentConfig>): AgentConfig {
  const cfg = normalizeAgentConfig({ ...getAgentConfig(), ...next });
  writeJson(CONFIG_FILE, cfg);
  return cfg;
}

/** Về mặc định (xoá cả quy tắc tự tạo), giữ trạng thái tạm dừng */
export function resetAgentConfig(): AgentConfig {
  const cfg = normalizeAgentConfig({ paused: getAgentConfig().paused });
  writeJson(CONFIG_FILE, cfg);
  return cfg;
}

/* ───────── Dữ liệu Agent tự ghi ───────── */

const RUNTIME_FILE = file('agent-state.json');

export function getRuntime(): AgentRuntime {
  const saved = readJson<Partial<AgentRuntime>>(RUNTIME_FILE);
  return {
    lastRunAt: saved?.lastRunAt ?? null,
    lastRunError: saved?.lastRunError ?? null,
    proposals: saved?.proposals ?? [],
    actions: saved?.actions ?? [],
  };
}

/** Sửa dữ liệu Agent trong 1 bước (đọc → sửa → ghi), tuần tự trong 1 tiến trình */
export function updateRuntime(fn: (r: AgentRuntime) => AgentRuntime | void): AgentRuntime {
  const current = getRuntime();
  const next = fn(current) ?? current;
  writeJson(RUNTIME_FILE, next);
  return next;
}

export function getAgentState(): AgentState {
  return { ...getAgentConfig(), ...getRuntime() };
}
