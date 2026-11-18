import { config } from '../config.js';
import { getAccessToken, TikTokLoginRequired } from './auth.js';

/**
 * CHỈ các tool ĐỌC được phép gọi. Server không bao giờ gọi tool tạo/sửa/xoá
 * (gmv_max_creative_update, campaign_gmv_max_update, ...). Thêm tool vào đây phải là tool đọc.
 */
export const READ_TOOLS = ['gmv_max_report_get', 'gmv_max_campaign_get', 'gmv_max_store_list_get'] as const;
export type ReadTool = (typeof READ_TOOLS)[number];

/** Phản hồi chuẩn của TikTok Business API */
export interface TikTokResponse<T> {
  code: number;
  message: string;
  request_id?: string;
  data: T;
}

export class TikTokApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = 'TikTokApiError';
  }
}

interface JsonRpcMessage {
  id?: number;
  result?: { content?: { type: string; text?: string }[]; isError?: boolean; protocolVersion?: string };
  error?: unknown;
}

/** MCP TikTok giới hạn tần suất ngắn hạn khi nhiều báo cáo nặng chạy cùng lúc */
const MAX_CONCURRENT = 2;
let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

class McpSession {
  private sessionId: string | null = null;
  private protocolVersion = '2025-06-18';
  private rpcId = 0;
  private ready: Promise<void> | null = null;

  private async post(method: string, params: unknown, notification = false, retried = false): Promise<JsonRpcMessage | null> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${await getAccessToken()}`,
      'MCP-Protocol-Version': this.protocolVersion,
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    const id = notification ? undefined : ++this.rpcId;
    const res = await fetch(config.tiktok.mcpUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method, params, ...(id !== undefined && { id }) }),
    });
    this.sessionId = res.headers.get('mcp-session-id') ?? this.sessionId;
    const text = await res.text();

    if (res.status === 401 && !retried) {
      await getAccessToken(true); // gia hạn rồi thử lại 1 lần
      return this.post(method, params, notification, true);
    }
    if (res.status === 401) throw new TikTokLoginRequired();
    if (res.status === 404 && this.sessionId && !retried) {
      // Phiên MCP hết hạn → mở phiên mới
      this.reset();
      await this.init();
      return this.post(method, params, notification, true);
    }
    if (!res.ok) throw new TikTokApiError(`MCP HTTP ${res.status}: ${text.slice(0, 300)}`);
    if (notification || !text) return null;

    const message: JsonRpcMessage | undefined = res.headers.get('content-type')?.includes('text/event-stream')
      ? text
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => JSON.parse(l.slice(5)) as JsonRpcMessage)
          .find((m) => m.id === id)
      : (JSON.parse(text) as JsonRpcMessage);
    if (!message) throw new TikTokApiError('MCP không trả kết quả');
    if (message.error) throw new TikTokApiError(`MCP lỗi: ${JSON.stringify(message.error).slice(0, 300)}`);
    return message;
  }

  private reset() {
    this.sessionId = null;
    this.ready = null;
  }

  private init(): Promise<void> {
    this.ready ??= (async () => {
      const init = await this.post('initialize', {
        protocolVersion: this.protocolVersion,
        capabilities: {},
        clientInfo: { name: 'tiktok-shop-admin-server', version: '0.1.0' },
      });
      this.protocolVersion = init?.result?.protocolVersion ?? this.protocolVersion;
      await this.post('notifications/initialized', {}, true);
    })().catch((e) => {
      this.ready = null;
      throw e;
    });
    return this.ready;
  }

  async callTool(name: string, args: unknown): Promise<string> {
    await this.init();
    const msg = await this.post('tools/call', { name, arguments: args });
    const text = msg?.result?.content?.find((c) => c.type === 'text')?.text ?? '';
    if (msg?.result?.isError) throw new TikTokApiError(`Tool lỗi: ${text.slice(0, 300)}`);
    return text;
  }
}

const session = new McpSession();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Mã TikTok cho giới hạn tần suất */
const RATE_LIMIT_CODES = new Set([40100, 40133, 51021]);
const MAX_RETRIES = 5;

function isRateLimited(e: unknown) {
  return e instanceof TikTokApiError && (RATE_LIMIT_CODES.has(e.code ?? -1) || /rate limit/i.test(e.message));
}

async function callOnce<T>(tool: ReadTool, params: Record<string, unknown>): Promise<T> {
  const text = await withSlot(() => session.callTool('tool_execute', { tool_name: tool, params }));
  let json: TikTokResponse<T>;
  try {
    json = JSON.parse(text) as TikTokResponse<T>;
  } catch {
    throw new TikTokApiError(`TikTok trả dữ liệu không đọc được: ${text.slice(0, 200)}`);
  }
  if (json.code !== 0) throw new TikTokApiError(`TikTok trả lỗi ${json.code}: ${json.message}`, json.code);
  return json.data;
}

/** Gọi 1 tool ĐỌC của TikTok qua tool_execute. Tool không nằm trong READ_TOOLS → lỗi ngay, không gửi đi. */
export async function callReadTool<T>(tool: ReadTool, params: Record<string, unknown>): Promise<T> {
  if (!(READ_TOOLS as readonly string[]).includes(tool)) {
    throw new Error(`Tool "${tool}" không nằm trong danh sách tool đọc được phép`);
  }
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOnce<T>(tool, params);
    } catch (e) {
      if (!isRateLimited(e) || attempt >= MAX_RETRIES) throw e;
      // Chờ tăng dần 1s, 2s, 4s, 8s, 16s (+ ngẫu nhiên để các lời gọi không dồn lại cùng lúc)
      await sleep(1000 * 2 ** attempt + Math.random() * 500);
    }
  }
}
