import { Router, type Response } from 'express';
import type { AdsSettings } from '../../shared/settings.js';
import type { AgentConfig, AgentGuardrails, AgentRule } from '../../shared/agentTypes.js';
import { executeManual, executeProposal, PrecheckError, undoAction, verifyAction, type ExecResult, type ManualInput } from '../agent/executor.js';
import { actorOf, requirePermission } from '../auth/middleware.js';
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
settingsRouter.get('/', requirePermission('view'), (_req, res) => {
  res.json({ settings: getSettings(), stored: settingsStored() });
});

settingsRouter.put('/', requirePermission('configure'), (req, res) => {
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

agentRouter.get('/state', requirePermission('view'), (_req, res) => {
  res.json(stateResponse());
});

/** Lưu cấu hình Agent: quy tắc, giới hạn an toàn, tạm dừng */
agentRouter.put('/config', requirePermission('configure'), (req, res) => {
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

agentRouter.post('/config/reset', requirePermission('configure'), (_req, res) => {
  resetAgentConfig();
  res.json(stateResponse());
});

/** Chạy ngay 1 lượt (chỉ tạo đề xuất / nhắc việc) */
agentRouter.post('/run', requirePermission('configure'), async (_req, res) => {
  try {
    const summary = await runAgentOnce('manual');
    res.json({ summary, state: stateResponse() });
  } catch (e) {
    res.status(502).json({ code: 'AGENT_RUN_FAILED', error: e instanceof Error ? e.message : String(e) });
  }
});

/** Kết quả thực thi → phản hồi; PrecheckError = 409 (không gửi lệnh nào) */
async function respondExec(res: Response, run: () => Promise<ExecResult>) {
  try {
    const result = await run();
    res.json({ result: { message: result.message, status: result.action.status, actionId: result.action.id }, state: stateResponse() });
  } catch (e) {
    if (e instanceof PrecheckError) {
      return res.status(409).json({ code: 'PRECHECK_FAILED', error: e.message, state: stateResponse() });
    }
    res.status(502).json({ code: 'EXECUTE_FAILED', error: e instanceof Error ? e.message : String(e), state: stateResponse() });
  }
}

/**
 * Duyệt = THỰC THI THẬT trên TikTok (giai đoạn C). Bắt buộc body { confirm: true } — web chỉ gửi sau hộp xác nhận.
 */
agentRouter.post('/proposals/:id/approve', requirePermission('execute'), async (req, res) => {
  if ((req.body as { confirm?: unknown } | undefined)?.confirm !== true) {
    return res.status(400).json({ code: 'CONFIRM_REQUIRED', error: 'Cần xác nhận trước khi chạy thật trên TikTok' });
  }
  await respondExec(res, () => executeProposal(req.params.id, actorOf(req)));
});

/** Bỏ qua đề xuất */
agentRouter.post('/proposals/:id/reject', requirePermission('execute'), (req, res) => {
  const { id } = req.params;
  const by = actorOf(req);
  let found = false;
  let wasPending = false;
  updateRuntime((rt) => {
    const p = rt.proposals.find((x) => x.id === id);
    if (!p) return;
    found = true;
    if (p.status !== 'pending') return;
    wasPending = true;
    p.status = 'rejected';
    p.decidedAt = new Date().toISOString();
    if (by) p.decidedBy = by;
  });
  if (!found) return res.status(404).json({ code: 'NOT_FOUND', error: 'Không tìm thấy đề xuất' });
  if (!wasPending) return res.status(409).json({ code: 'NOT_PENDING', error: 'Đề xuất không còn chờ duyệt' });
  res.json(stateResponse());
});

/** Hoàn tác thao tác (cũng cần { confirm: true }) */
agentRouter.post('/actions/:id/undo', requirePermission('execute'), async (req, res) => {
  if ((req.body as { confirm?: unknown } | undefined)?.confirm !== true) {
    return res.status(400).json({ code: 'CONFIRM_REQUIRED', error: 'Cần xác nhận trước khi hoàn tác trên TikTok' });
  }
  await respondExec(res, () => undoAction(req.params.id, actorOf(req)));
});

/** Thao tác thủ công từ bảng Video (Gỡ / Thêm lại / Tăng cường) — CHẠY THẬT, bắt buộc { confirm: true } */
agentRouter.post('/actions/manual', requirePermission('execute'), async (req, res) => {
  const body = req.body as (Partial<ManualInput> & { confirm?: unknown }) | undefined;
  if (body?.confirm !== true) {
    return res.status(400).json({ code: 'CONFIRM_REQUIRED', error: 'Cần xác nhận trước khi chạy thật trên TikTok' });
  }
  await respondExec(res, () =>
    executeManual(
      { actionType: String(body.actionType ?? ''), target: body.target as ManualInput['target'], params: body.params },
      actorOf(req),
    ),
  );
});

/** Kiểm tra ngay kết quả gỡ / thêm video — CHỈ ĐỌC trạng thái trên TikTok, không gửi lệnh ghi */
agentRouter.post('/actions/:id/verify', requirePermission('execute'), async (req, res) => {
  await respondExec(res, () => verifyAction(req.params.id));
});
