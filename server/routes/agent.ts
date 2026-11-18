import { Router, type Response } from 'express';
import type { AdsSettings } from '../../shared/settings.js';
import type { AgentConfig, AgentGuardrails, AgentRule } from '../../shared/agentTypes.js';
import { AGENT_INTERVAL_MINUTES, getNextRunAt, isAgentRunning, runAgentOnce } from '../agent/scheduler.js';
import {
  agentConfigStored,
  getAgentState,
  getSettings,
  resetAgentConfig,
  saveAgentConfig,
  saveSettings,
  settingsStored,
  updateRuntime,
} from '../store.js';

export const settingsRouter = Router();
export const agentRouter = Router();

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const bad = (res: Response, error: string) => res.status(400).json({ code: 'BAD_REQUEST', error });

/* ───────── Thiết lập phân loại (ROI hoà vốn + nhóm) ───────── */

/** stored = false: server chưa từng lưu (đang dùng mặc định) → web có thể đẩy bản cũ trong trình duyệt lên */
settingsRouter.get('/', (_req, res) => {
  res.json({ settings: getSettings(), stored: settingsStored() });
});

settingsRouter.put('/', (req, res) => {
  const body = req.body as Partial<AdsSettings>;
  if (!isObj(body)) return bad(res, 'Thiếu dữ liệu thiết lập');
  if (body.breakEvenRoi !== undefined && !isObj(body.breakEvenRoi)) return bad(res, 'breakEvenRoi không hợp lệ');
  for (const k of ['groups', 'productGroups', 'campaignGroups'] as const) {
    if (body[k] !== undefined && !Array.isArray(body[k])) return bad(res, `${k} không hợp lệ`);
  }
  // Chỉ giữ ROI hoà vốn là số dương
  const breakEvenRoi = Object.fromEntries(
    Object.entries(body.breakEvenRoi ?? getSettings().breakEvenRoi).filter(([, v]) => typeof v === 'number' && v > 0),
  );
  res.json({ settings: saveSettings({ ...getSettings(), ...body, breakEvenRoi }), stored: true });
});

/* ───────── Agent ───────── */

const stateResponse = () => ({
  ...getAgentState(),
  running: isAgentRunning(),
  configStored: agentConfigStored(),
  nextRunAt: getNextRunAt(),
  intervalMinutes: AGENT_INTERVAL_MINUTES,
});

agentRouter.get('/state', (_req, res) => {
  res.json(stateResponse());
});

/** Lưu cấu hình Agent: quy tắc, giới hạn an toàn, tạm dừng */
agentRouter.put('/config', (req, res) => {
  const body = req.body as Partial<AgentConfig>;
  if (!isObj(body)) return bad(res, 'Thiếu dữ liệu cấu hình');
  const patch: Partial<AgentConfig> = {};
  if (body.paused !== undefined) {
    if (typeof body.paused !== 'boolean') return bad(res, 'paused không hợp lệ');
    patch.paused = body.paused;
  }
  if (body.rules !== undefined) {
    if (!Array.isArray(body.rules) || !body.rules.every((r: AgentRule) => isObj(r) && typeof r.id === 'string')) {
      return bad(res, 'rules không hợp lệ');
    }
    patch.rules = body.rules;
  }
  if (body.guardrails !== undefined) {
    if (!isObj(body.guardrails)) return bad(res, 'guardrails không hợp lệ');
    patch.guardrails = body.guardrails as unknown as AgentGuardrails;
  }
  saveAgentConfig(patch);
  res.json(stateResponse());
});

agentRouter.post('/config/reset', (_req, res) => {
  resetAgentConfig();
  res.json(stateResponse());
});

/** Chạy ngay 1 lượt (chỉ tạo đề xuất / nhắc việc) */
agentRouter.post('/run', async (_req, res) => {
  try {
    const summary = await runAgentOnce('manual');
    res.json({ summary, state: stateResponse() });
  } catch (e) {
    res.status(502).json({ code: 'AGENT_RUN_FAILED', error: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * Duyệt / bỏ qua đề xuất. GIAI ĐOẠN B: duyệt chỉ ghi nhận, KHÔNG thao tác trên TikTok.
 */
agentRouter.post('/proposals/:id/:decision', (req, res) => {
  const { id, decision } = req.params;
  if (decision !== 'approve' && decision !== 'reject') return bad(res, 'Hành động không hợp lệ');
  let found = false;
  let wasPending = false;
  updateRuntime((rt) => {
    const p = rt.proposals.find((x) => x.id === id);
    if (!p) return;
    found = true;
    if (p.status !== 'pending') return;
    wasPending = true;
    p.status = decision === 'approve' ? 'approved' : 'rejected';
    p.decidedAt = new Date().toISOString();
    if (decision === 'approve') p.note = 'Đã duyệt — chưa thực thi trên TikTok (chưa bật giai đoạn thực thi)';
  });
  if (!found) return res.status(404).json({ code: 'NOT_FOUND', error: 'Không tìm thấy đề xuất' });
  if (!wasPending) return res.status(409).json({ code: 'NOT_PENDING', error: 'Đề xuất không còn chờ duyệt' });
  res.json(stateResponse());
});
