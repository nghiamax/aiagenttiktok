import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import agentJson from '../../../data/agent.json';
import { api } from '../../../lib/api';
import { useAuth } from '../../../auth/AuthProvider';
import type { ActionStatus, AgentActionType, AgentConfig, AgentGuardrails, AgentRule, AgentRuleParams, AgentState, AgentTarget } from './types';

/** Mặc định khi chưa kết nối server (src/data/agent.json) */
const DEFAULT_STATE = agentJson as AgentState;
/** Bản cũ lưu trong trình duyệt trước khi có server — đẩy lên server 1 lần rồi xoá */
const LEGACY_KEY = 'ads-agent-config-v1';
/** Tự tải lại dữ liệu Agent (đề xuất, nhật ký mới) */
const POLL_MS = 60_000;
/** Có thao tác đang chờ TikTok xác nhận → tải lại dày hơn để trạng thái tự đổi */
const FAST_POLL_MS = 5_000;

interface ServerState extends AgentState {
  running: boolean;
  configStored: boolean;
  nextRunAt: string | null;
  intervalMinutes: number;
  serverVersion?: string | null;
}

/** Lịch quét của server */
export interface AgentSchedule {
  nextRunAt: string | null;
  intervalMinutes: number;
  /** Commit code của tiến trình server đang trả lời */
  serverVersion?: string | null;
}

export interface RunSummary {
  proposals: number;
  reminders: number;
  expired: number;
  /** Đề xuất đang chờ bị huỷ vì số liệu mới không còn khớp */
  outdated?: number;
  skipped?: 'paused';
  skippedTargets: Record<string, number>;
  /** BOT chạy: số đề xuất đã tự thực thi / chưa chạy được (chờ duyệt) */
  auto?: { ran: number; failed: number };
}

/** Kết quả Duyệt (chạy thật) / Bỏ qua / Hoàn tác */
export interface ExecOutcome {
  ok: boolean;
  message: string;
  /** Trạng thái dòng nhật ký sau khi gửi lệnh (running = chờ TikTok xác nhận) */
  status?: ActionStatus;
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
  /** approve = chạy thật trên TikTok (gửi confirm: true — chỉ gọi sau hộp xác nhận) */
  decide: (proposalId: string, decision: 'approve' | 'reject') => Promise<ExecOutcome>;
  /** Hoàn tác thao tác (chỉ gọi sau hộp xác nhận) */
  undo: (actionId: string) => Promise<ExecOutcome>;
  /** Gửi lại lệnh Gỡ / Thêm lại bị lỗi */
  retry: (actionId: string) => Promise<ExecOutcome>;
  /** Kiểm tra ngay kết quả gỡ / thêm video (chỉ đọc) */
  verify: (actionId: string) => Promise<ExecOutcome>;
  /** Xoá dòng Nhật ký (chỉ ẩn, đã qua hộp xác nhận) */
  hideActions: (ids: string[]) => Promise<ExecOutcome>;
  /** Thao tác thủ công từ bảng Video (chạy thật — chỉ gọi sau hộp xác nhận) */
  runManual: (actionType: AgentActionType, target: AgentTarget, params?: AgentRuleParams) => Promise<ExecOutcome>;
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
  // Chế độ khách: giữ mặc định, không gọi API (provider dựng lại khi đăng nhập)
  const { guest } = useAuth();
  const [state, setState] = useState<AgentState>(DEFAULT_STATE);
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<AgentSchedule>({ nextRunAt: null, intervalMinutes: 60 });

  const accept = useCallback((s: ServerState) => {
    const { running: r, configStored: _stored, nextRunAt, intervalMinutes, serverVersion, ...rest } = s;
    setState(rest);
    setRunning(r);
    setSchedule({ nextRunAt, intervalMinutes, serverVersion: serverVersion ?? null });
    setConnected(true);
    setError(null);
  }, []);

  const fail = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);

  // Lần đầu: tải từ server; server chưa có cấu hình mà trình duyệt còn bản cũ → đẩy lên
  useEffect(() => {
    if (guest) return;
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
  }, [guest, accept, fail]);

  // Có dòng nhật ký đang chờ TikTok xác nhận, BOT đang quét, hoặc chưa kết nối được server → tải lại mỗi 5 giây
  // (Sếp chốt 28/11: BOT vừa gỡ video thì Tổng quan / bảng phải đổi ngay, không đợi lượt tải 60 giây)
  const hasRunning = state.actions.some((a) => a.status === 'running');
  useEffect(() => {
    if (guest || (!hasRunning && !running && connected)) return;
    const timer = setInterval(() => {
      api<ServerState>('/agent/state').then(accept, () => undefined);
    }, FAST_POLL_MS);
    return () => clearInterval(timer);
  }, [guest, hasRunning, running, connected, accept]);

  // Tới giờ lượt quét theo lịch → tải lại ngay (rồi theo nhịp 5 giây khi server báo đang quét)
  useEffect(() => {
    if (guest || !schedule.nextRunAt) return;
    const wait = Date.parse(schedule.nextRunAt) - Date.now() + 3_000;
    if (!(wait > 0) || wait > 2 * 3_600_000) return;
    const t = window.setTimeout(() => {
      api<ServerState>('/agent/state').then(accept, () => undefined);
    }, wait);
    return () => window.clearTimeout(t);
  }, [guest, schedule.nextRunAt, accept]);

  /** Lưu cấu hình. Chưa tải được từ server thì KHÔNG lưu (tránh ghi đè quy tắc / giới hạn bằng mặc định) */
  const saveConfig = useCallback(
    (patch: Partial<AgentConfig>) => {
      if (!connected) {
        setError('Chưa kết nối được server nên chưa lưu — đợi server chạy rồi thử lại.');
        return;
      }
      setState((prev) => ({ ...prev, ...patch }));
      api<ServerState>('/agent/config', { method: 'PUT', body: patch }).then(accept, fail);
    },
    [accept, fail, connected],
  );

  /** Gửi lệnh chạy thật; lỗi (kể cả không đạt điều kiện) → tải lại trạng thái để thấy ghi chú mới */
  const execute = useCallback(
    async (path: string, extra?: Record<string, unknown>): Promise<ExecOutcome> => {
      try {
        const res = await api<{ result: { message: string; status: ActionStatus }; state: ServerState }>(path, {
          method: 'POST',
          body: { ...extra, confirm: true },
        });
        accept(res.state);
        return { ok: res.result.status !== 'failed', message: res.result.message, status: res.result.status };
      } catch (e) {
        api<ServerState>('/agent/state').then(accept, () => undefined);
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    },
    [accept],
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
        const path = `/agent/proposals/${encodeURIComponent(proposalId)}/${decision}`;
        if (decision === 'reject') {
          try {
            accept(await api<ServerState>(path, { method: 'POST' }));
            return { ok: true, message: 'Đã bỏ qua' };
          } catch (e) {
            return { ok: false, message: e instanceof Error ? e.message : String(e) };
          }
        }
        return execute(path);
      },
      undo: (actionId) => execute(`/agent/actions/${encodeURIComponent(actionId)}/undo`),
      retry: (actionId) => execute(`/agent/actions/${encodeURIComponent(actionId)}/retry`),
      verify: (actionId) => execute(`/agent/actions/${encodeURIComponent(actionId)}/verify`),
      hideActions: async (ids) => {
        try {
          const res = await api<ServerState & { hidden: number; skippedRunning: number }>('/agent/actions/hide', {
            method: 'POST',
            body: { ids, confirm: true },
          });
          accept(res);
          const skip = res.skippedRunning ? ` · bỏ qua ${res.skippedRunning} dòng đang chờ TikTok` : '';
          return { ok: true, message: `Đã xoá ${res.hidden} dòng${skip}` };
        } catch (e) {
          return { ok: false, message: e instanceof Error ? e.message : String(e) };
        }
      },
      runManual: (actionType, target, params) => execute('/agent/actions/manual', { actionType, target, params }),
    }),
    [state, running, connected, error, schedule, saveConfig, accept, fail, execute],
  );

  return <AgentStoreContext.Provider value={value}>{children}</AgentStoreContext.Provider>;
}

export function useAgentStore(): AgentStoreValue {
  const ctx = useContext(AgentStoreContext);
  if (!ctx) throw new Error('useAgentStore phải nằm trong AgentStoreProvider');
  return ctx;
}
