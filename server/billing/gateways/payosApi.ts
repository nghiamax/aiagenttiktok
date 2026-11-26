import crypto from 'node:crypto';
import { GatewayError } from './types.js';

/**
 * payOS (payos.vn) — tạo link / mã QR cho từng đơn, báo tiền về qua webhook có chữ ký HMAC-SHA256 (Checksum Key).
 * Tài liệu: https://payos.vn/docs/api/
 */

export const PAYOS_API = 'https://api-merchant.payos.vn';

export interface PayosKeys {
  clientId: string;
  apiKey: string;
  checksumKey: string;
}

const sortKeys = (o: unknown): unknown =>
  o && typeof o === 'object' && !Array.isArray(o)
    ? Object.fromEntries(
        Object.keys(o as Record<string, unknown>)
          .sort()
          .map((k) => [k, (o as Record<string, unknown>)[k]]),
      )
    : o;

/** Chuỗi ký theo payOS: khoá xếp a→z, "key=value" nối "&"; null / undefined → rỗng; mảng → JSON (khoá từng phần tử xếp a→z) */
export function payosDataString(data: Record<string, unknown>): string {
  return Object.keys(data)
    .sort()
    .filter((k) => data[k] !== undefined)
    .map((k) => {
      const v = data[k];
      let s: string;
      if (v === null || v === 'null' || v === 'undefined') s = '';
      else if (Array.isArray(v)) s = JSON.stringify(v.map(sortKeys));
      else if (typeof v === 'object') s = JSON.stringify(sortKeys(v));
      else s = String(v);
      return `${k}=${s}`;
    })
    .join('&');
}

export const payosSign = (data: Record<string, unknown>, checksumKey: string) =>
  crypto.createHmac('sha256', checksumKey).update(payosDataString(data)).digest('hex');

/** Kiểm tra chữ ký webhook (so thời gian không đổi) */
export function payosVerify(data: unknown, signature: unknown, checksumKey: string): boolean {
  if (!checksumKey || !data || typeof data !== 'object' || typeof signature !== 'string') return false;
  const want = Buffer.from(payosSign(data as Record<string, unknown>, checksumKey));
  const got = Buffer.from(signature.toLowerCase());
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

async function call<T>(keys: PayosKeys, method: 'GET' | 'POST', pathname: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${PAYOS_API}${pathname}`, {
      method,
      headers: { 'x-client-id': keys.clientId, 'x-api-key': keys.apiKey, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GatewayError('Không kết nối được payOS — thử lại sau');
  }
  const json = (await res.json().catch(() => null)) as { code?: string; desc?: string; data?: T } | null;
  if (!res.ok || !json || json.code !== '00' || json.data == null) {
    throw new GatewayError(`payOS báo lỗi: ${json?.desc ?? `HTTP ${res.status}`}`);
  }
  return json.data;
}

export interface PayosLink {
  bin: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  description: string;
  orderCode: number;
  paymentLinkId: string;
  status: string;
  checkoutUrl: string;
  qrCode: string;
}

export function createPayosLink(
  keys: PayosKeys,
  p: {
    orderCode: number;
    amount: number;
    description: string;
    returnUrl: string;
    cancelUrl: string;
    expiredAt: number;
  },
): Promise<PayosLink> {
  const signature = payosSign(
    {
      amount: p.amount,
      cancelUrl: p.cancelUrl,
      description: p.description,
      orderCode: p.orderCode,
      returnUrl: p.returnUrl,
    },
    keys.checksumKey,
  );
  return call<PayosLink>(keys, 'POST', '/v2/payment-requests', { ...p, signature });
}

export interface PayosLinkInfo {
  orderCode: number;
  amount: number;
  amountPaid: number;
  status: string;
}

export const getPayosLink = (keys: PayosKeys, orderCode: number) =>
  call<PayosLinkInfo>(keys, 'GET', `/v2/payment-requests/${orderCode}`);

/** Đăng ký URL webhook với payOS (payOS gửi thử 1 webhook mẫu tới URL đó) */
export const confirmPayosWebhook = (keys: PayosKeys, webhookUrl: string) =>
  call<{ webhookUrl: string; accountNumber?: string; accountName?: string; name?: string }>(
    keys,
    'POST',
    '/confirm-webhook',
    { webhookUrl },
  );
