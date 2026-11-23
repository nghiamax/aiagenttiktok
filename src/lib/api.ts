/** Gọi API của server (cùng origin, Vite proxy /api khi chạy dev) */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

/** Phiên đăng nhập hết / chưa đăng nhập → AuthProvider nghe sự kiện này để về trang đăng nhập */
export const AUTH_REQUIRED_EVENT = 'auth:required';

/** Gọi khi một phản hồi API báo AUTH_REQUIRED (cả các chỗ dùng fetch trực tiếp) */
export function notifyAuthRequired(status: number, code: string | undefined) {
  // globalThis = window trên trình duyệt (viết vậy để file cũng kiểm tra type được trong tests/, không có DOM)
  if (status === 401 && code === 'AUTH_REQUIRED')
    (globalThis as unknown as EventTarget).dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
}

export async function api<T>(
  path: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('Không kết nối được server (npm run server)', 'NETWORK');
  }
  const body = (await res.json().catch(() => null)) as (T & { code?: string; error?: string }) | null;
  if (!res.ok || body === null) {
    // /auth/me tự xử lý 401 (trang đăng nhập), không cần phát sự kiện
    if (!path.startsWith('/auth/')) notifyAuthRequired(res.status, body?.code);
    throw new ApiError(body?.error ?? `Server lỗi (HTTP ${res.status})`, body?.code, res.status);
  }
  return body;
}
