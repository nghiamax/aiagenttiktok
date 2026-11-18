import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import agentJson from '../../../data/agent.json';
import { api } from '../../../lib/api';
import type { AgentConfig, AgentGuardrails, AgentRule, AgentState } from './types';

/** Mặc định khi chưa kết nối server (src/data/agent.json) */
const DEFAULT_STATE = agentJson as AgentState;
/** Bản cũ lưu trong trình duyệt trước khi có server — đẩy lên server 1 lần rồi xoá */
const LEGACY_KEY = 'ads-agent-config-v1';
/** Tự tải lại dữ liệu Agent (đề xuất, nhật ký mới) */
const POLL_MS = 60_000;

interface ServerState extends AgentState {
  running: boolean;
  configStored: boolean;
  nextRunAt: string | null;
  intervalMinutes: number;
}

/** Lịch quét của server */
export interface AgentSchedule {
  nextRunAt: string | null;
  intervalMinutes: number;
}

export interface RunSummary {
  proposals: number;
  reminders: number;
  expired: number;
  skipped?: 'paused';
  skippedTargets: Record<string, number>;
}

interface AgentStoreValue {
  state: AgentState;
  /** Đang có lượt chạy trên server */
  running: boolean;
  /** Đã nhận dữ liệu từ server */
  connected: boolean;
  error: string | null;
  schedule: AgentSchedule;
  updateRule: (id: string, patch: Partial<AgentRule>) => void;
  addRule: (rule: AgentRule) => void;
  removeRule: (id: string) => void;
  updateGuardrails: (patch: Partial<AgentGuardrails>) => void;
  setPaused: (paused: boolean) => void;
  reset: () => void;
  runNow: () => Promise<RunSummary | null>;
  decide: (proposalId: string, decision: 'approve' | 'reject') => Promise<void>;
}

const AgentStoreContext = createContext<AgentStoreValue | null>(null);

function readLegacy(): Partial<AgentConfig> | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    return raw ? (JSON.parse(raw) as Partial<AgentConfig>) : null;
  } catch {
    return null;
  }
}

function clearLegacy() {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* bỏ qua */
  }
}

/** Dữ liệu Agent dùng chung (Tổng quan + AI Agent), lưu trên server */
export function AgentStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AgentState>(DEFAULT_STATE);
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<AgentSchedule>({ nextRunAt: null, intervalMinutes: 60 });

  const accept = useCallback((s: ServerState) => {
    const { running: r, configStored: _stored, nextRunAt, intervalMinutes, ...rest } = s;
    setState(rest);
    setRunning(r);
    setSchedule({ nextRunAt, intervalMinutes });
    setConnected(true);
    setError(null);
  }, []);

  const fail = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);

  // Lần đầu: tải từ server; server chưa có cấu hình mà trình duyệt còn bản cũ → đẩy lên
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let s = await api<ServerState>('/agent/state');
        const legacy = readLegacy();
        if (!s.configStored && legacy) {
          s = await api<ServerState>('/agent/config', { method: 'PUT', body: legacy });
        }
        if (legacy) clearLegacy();
        if (!cancelled) accept(s);
      } catch (e) {
        if (!cancelled) fail(e);
      }
    })();
    const timer = setInterval(() => {
      api<ServerState>('/agent/state').then(accept, fail);
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [accept, fail]);

  /** Lưu cấu hình: cập nhật giao diện ngay, rồi gửi server */
  const saveConfig = useCallback(
    (patch: Partial<AgentConfig>) => {
      setState((prev) => ({ ...prev, ...patch }));
      api<ServerState>('/agent/config', { method: 'PUT', body: patch }).then(accept, fail);
    },
    [accept, fail],
  );

  const value = useMemo<AgentStoreValue>(
    () => ({
      state,
      running,
      connected,
      error,
      schedule,
      updateRule: (id, patch) => saveConfig({ rules: state.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) }),
      addRule: (rule) => saveConfig({ rules: [...state.rules, { ...rule, custom: true }] }),
      removeRule: (id) => saveConfig({ rules: state.rules.filter((r) => r.id !== id || !r.custom) }),
      updateGuardrails: (patch) => saveConfig({ guardrails: { ...state.guardrails, ...patch } }),
      setPaused: (paused) => saveConfig({ paused }),
      reset: () => {
        api<ServerState>('/agent/config/reset', { method: 'POST' }).then(accept, fail);
      },
      runNow: async () => {
        setRunning(true);
        try {
          const res = await api<{ summary: RunSummary; state: ServerState }>('/agent/run', { method: 'POST' });
          accept(res.state);
          return res.summary;
        } catch (e) {
          fail(e);
          setRunning(false);
          return null;
        }
      },
      decide: async (proposalId, decision) => {
        try {
          accept(await api<ServerState>(`/agent/proposals/${encodeURIComponent(proposalId)}/${decision}`, { method: 'POST' }));
        } catch (e) {
          fail(e);
        }
      },
    }),
    [state, running, connected, error, schedule, saveConfig, accept, fail],
  );

  return <AgentStoreContext.Provider value={value}>{children}</AgentStoreContext.Provider>;
}

export function useAgentStore(): AgentStoreValue {
  const ctx = useContext(AgentStoreContext);
  if (!ctx) throw new Error('useAgentStore phải nằm trong AgentStoreProvider');
  return ctx;
}
