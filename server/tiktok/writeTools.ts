import { EXECUTION_ENABLED } from '../../shared/agentPolicy.js';
import { callWithRetry } from './mcpClient.js';

/**
 * Tool GHI của TikTok — chỉ server/agent/executor.ts được gọi, và chỉ sau khi Sếp bấm Duyệt + Xác nhận trên web.
 * Không thêm tool vào đây nếu Sếp chưa đồng ý rõ ràng.
 */
export const WRITE_TOOLS = ['gmv_max_creative_update', 'campaign_gmv_max_session_create', 'campaign_gmv_max_update'] as const;
export type WriteTool = (typeof WRITE_TOOLS)[number];

/** Lệnh ghi chỉ thử lại khi bị giới hạn tần suất (TikTok từ chối, lệnh chưa chạy) — tối đa 3 lần */
const WRITE_RETRIES = 3;

export async function callWriteTool<T>(tool: WriteTool, params: Record<string, unknown>): Promise<T> {
  if (!(WRITE_TOOLS as readonly string[]).includes(tool)) {
    throw new Error(`Tool "${tool}" không nằm trong danh sách tool ghi được phép`);
  }
  if (!EXECUTION_ENABLED) throw new Error('Thực thi trên TikTok đang tắt (EXECUTION_ENABLED = false)');
  console.log(`[write] ${tool} ${JSON.stringify(params).slice(0, 500)}`);
  return callWithRetry<T>(tool, params, WRITE_RETRIES);
}
