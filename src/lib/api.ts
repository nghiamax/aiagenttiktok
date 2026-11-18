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

export async function api<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
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
    throw new ApiError(body?.error ?? `Server lỗi (HTTP ${res.status})`, body?.code, res.status);
  }
  return body;
}
