import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/* Nút Kết nối TikTok trên web: state 1 lần / đúng người / hết hạn, lưu token, không lộ token, gia hạn thất bại — TikTok giả lập */
const dir = vi.hoisted(() => ({ path: '' }));
vi.mock('../server/config', async () => {
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  dir.path = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'ttconnect-'));
  return {
    config: {
      dataDir: dir.path,
      secretsDir: dir.path,
      cookieSecure: false,
      publicUrl: null,
      root: process.cwd(),
      allowedOrigins: ['http://localhost:5173'],
      tiktok: { mcpUrl: 'https://tt.invalid/mcp', advertiserId: 'adv', storeId: 'store', advertiserName: 'shop', currency: 'VND' },
    },
  };
});

const SECRET = 'access-token-bi-mat';
let tokenStatus = 200;
let refreshMode: 'ok' | 'reject' | 'network' = 'ok';
let revokeMode: 'ok' | 'error' | 'network' = 'ok';
const calls: { url: string; body: string }[] = [];

vi.stubGlobal('fetch', async (url: string, init?: { body?: unknown }) => {
  const body = String(init?.body ?? '');
  calls.push({ url, body });
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
  if (url.endsWith('/.well-known/oauth-authorization-server'))
    return json(200, { authorization_endpoint: 'https://tt.invalid/authorize', token_endpoint: 'https://tt.invalid/token', registration_endpoint: 'https://tt.invalid/register', revocation_endpoint: 'https://tt.invalid/revoke' });
  if (url === 'https://tt.invalid/revoke') {
    if (revokeMode === 'network') throw new TypeError('fetch failed');
    return new Response('', { status: revokeMode === 'ok' ? 200 : 500 });
  }
  if (url === 'https://tt.invalid/register') return json(201, { client_id: 'client-1' });
  if (url === 'https://tt.invalid/token') {
    if (body.includes('grant_type=refresh_token')) {
      if (refreshMode === 'network') throw new TypeError('fetch failed');
      if (refreshMode === 'reject') return json(400, { error: 'invalid_grant' });
      return json(200, { access_token: 'moi', refresh_token: 'r2', expires_in: 86399 });
    }
    return json(tokenStatus, tokenStatus === 200 ? { access_token: SECRET, refresh_token: 'r1', expires_in: 86399 } : { error: 'bad' });
  }
  throw new Error(`fetch lạ: ${url}`);
});

const flow = await import('../server/tiktok/oauthFlow');
const tAuth = await import('../server/tiktok/auth');
const users = await import('../server/auth/users');
const sessions = await import('../server/auth/sessions');
const { tiktokCallback, tiktokRouter } = await import('../server/routes/tiktok');

const tokenFile = () => path.join(dir.path, 'tiktok-mcp.json');
const SEP = { id: 'u1', name: 'Sếp' };
const REDIRECT = 'http://localhost:5173/api/tiktok/callback';
const stateOf = (authUrl: string) => new URL(authUrl).searchParams.get('state')!;

beforeEach(() => {
  flow.resetPending();
  tokenStatus = 200;
  refreshMode = 'ok';
  revokeMode = 'ok';
  calls.length = 0;
  for (const f of ['tiktok-mcp.json', 'users.json', 'sessions.json']) fs.rmSync(path.join(dir.path, f), { force: true });
});
afterAll(() => fs.rmSync(dir.path, { recursive: true, force: true }));

describe('startConnect / finishConnect', () => {
  it('link đăng nhập có redirect về web + PKCE S256; đúng state → lưu token kèm người / lúc kết nối', async () => {
    const authUrl = await flow.startConnect(REDIRECT, SEP);
    const u = new URL(authUrl);
    expect(u.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(JSON.parse(calls.find((c) => c.url.endsWith('/register'))!.body).redirect_uris).toEqual([REDIRECT]);

    await flow.finishConnect({ state: stateOf(authUrl), code: 'abc' }, SEP.id);
    const t = tAuth.readToken()!;
    expect(t.access_token).toBe(SECRET);
    expect(t.connectedBy).toEqual(SEP);
    expect(t.connectedAt).toBeTruthy();
    expect(calls.find((c) => c.body.includes('grant_type=authorization_code'))!.body).toContain('code_verifier=');
  });

  it('state sai / dùng lần 2 / người khác / quá 10 phút / TikTok từ chối → không lưu token', async () => {
    await expect(flow.finishConnect({ state: 'gia', code: 'x' }, SEP.id)).rejects.toMatchObject({ code: 'BAD_STATE' });

    const s1 = stateOf(await flow.startConnect(REDIRECT, SEP));
    await expect(flow.finishConnect({ state: s1, code: 'x' }, 'u2')).rejects.toMatchObject({ code: 'WRONG_USER' });
    await expect(flow.finishConnect({ state: s1, code: 'x' }, SEP.id)).rejects.toMatchObject({ code: 'BAD_STATE' }); // đã dùng

    const now = Date.now();
    const s2 = stateOf(await flow.startConnect(REDIRECT, SEP, now));
    await expect(flow.finishConnect({ state: s2, code: 'x' }, SEP.id, now + flow.PENDING_TTL_MS + 1)).rejects.toMatchObject({ code: 'EXPIRED' });

    const s3 = stateOf(await flow.startConnect(REDIRECT, SEP));
    await expect(flow.finishConnect({ state: s3, error: 'access_denied' }, SEP.id)).rejects.toMatchObject({ code: 'DENIED' });
    expect(fs.existsSync(tokenFile())).toBe(false);
  });
});

describe('GET /api/tiktok/callback', () => {
  function call(cookie: string | undefined, query: Record<string, string>) {
    let location = '';
    const req = { query, get: (h: string) => (h.toLowerCase() === 'cookie' ? cookie : undefined) } as unknown as Request;
    const res = { redirect: (_s: number, url: string) => void (location = url) } as unknown as Response;
    return tiktokCallback(req, res).then(() => location);
  }

  it('trình duyệt đang đăng nhập nhân viên (người khác) → báo lỗi, không lưu token', async () => {
    const authUrl = await flow.startConnect(REDIRECT, SEP);
    const nv = users.createUser({ username: 'nhanvien', password: 'matkhau123', role: 'staff' });
    expect(await call(`sid=${sessions.createSession(nv.id)}`, { state: stateOf(authUrl), code: 'x' })).toMatch(/^\/tiktok\/done\?error=/);
    expect(fs.existsSync(tokenFile())).toBe(false);
  });

  it('copy link sang trình duyệt chưa đăng nhập web + state đúng → lưu token (người bấm), về /tiktok/done', async () => {
    const authUrl = await flow.startConnect(REDIRECT, SEP);
    const loc = await call(undefined, { state: stateOf(authUrl), code: 'abc' });
    expect(loc).toBe("/tiktok/done");
    expect(tAuth.readToken()?.connectedBy).toEqual(SEP);
    expect(loc).not.toContain(SECRET);
  });

  it('trình duyệt chưa đăng nhập web + state sai / đã dùng / hết hạn → không lưu, /tiktok/done?error', async () => {
    expect(await call(undefined, { state: 'doan-bua', code: 'x' })).toMatch(/^\/tiktok\/done\?error=/);
    const s = stateOf(await flow.startConnect(REDIRECT, SEP, Date.now() - flow.PENDING_TTL_MS - 1));
    expect(await call(undefined, { state: s, code: 'x' })).toMatch(/^\/tiktok\/done\?error=/);
    expect(fs.existsSync(tokenFile())).toBe(false);
  });

  it('chủ shop + đúng state → lưu token, chuyển về /tiktok/done (không có token trên URL)', async () => {
    const sep = users.createUser({ username: 'sep', name: 'Sếp', password: 'matkhau123' });
    const authUrl = await flow.startConnect(REDIRECT, { id: sep.id, name: 'Sếp' });
    const loc = await call(`sid=${sessions.createSession(sep.id)}`, { state: stateOf(authUrl), code: 'abc' });
    expect(loc).toBe("/tiktok/done");
    expect(loc).not.toContain(SECRET);
    expect(tAuth.readToken()?.connectedBy?.id).toBe(sep.id);
  });

  it('POST /connect cần quyền configure', () => {
    const layer = (tiktokRouter.stack as { route?: { path: string; stack: { handle: { permission?: string } }[] } }[]).find(
      (l) => l.route?.path === '/connect',
    );
    expect(layer?.route?.stack.map((s) => s.handle.permission).find(Boolean)).toBe('configure');
  });
});

describe('Gia hạn thất bại', () => {
  const expired = () =>
    tAuth.saveToken({ client_id: 'c', access_token: 'cu', refresh_token: 'r', expires_in: 1, connectedAt: '2026-11-19T00:00:00Z' });

  it('TikTok từ chối (4xx) → ghi refreshFailedAt, lần sau báo phải kết nối lại ngay (không gọi TikTok nữa)', async () => {
    expired();
    refreshMode = 'reject';
    await expect(tAuth.getAccessToken(true)).rejects.toBeInstanceOf(tAuth.TikTokLoginRequired);
    expect(tAuth.readToken()?.refreshFailedAt).toBeTruthy();
    calls.length = 0;
    await expect(tAuth.getAccessToken()).rejects.toBeInstanceOf(tAuth.TikTokLoginRequired);
    expect(calls).toHaveLength(0);
  });

  it('lỗi mạng tạm thời → không đánh dấu, lần sau vẫn gia hạn được', async () => {
    expired();
    refreshMode = 'network';
    await expect(tAuth.getAccessToken(true)).rejects.toThrow(/lỗi mạng/);
    expect(tAuth.readToken()?.refreshFailedAt).toBeUndefined();
    refreshMode = 'ok';
    expect(await tAuth.getAccessToken(true)).toBe('moi');
    expect(tAuth.readToken()?.connectedAt).toBe('2026-11-19T00:00:00Z'); // gia hạn giữ lúc kết nối
  });

  it('kết nối lại → token mới, hết dấu thất bại', async () => {
    expired();
    refreshMode = 'reject';
    await tAuth.getAccessToken(true).catch(() => {});
    const s = stateOf(await flow.startConnect(REDIRECT, SEP));
    await flow.finishConnect({ state: s, code: 'abc' }, SEP.id);
    expect(tAuth.readToken()?.refreshFailedAt).toBeUndefined();
    expect(await tAuth.getAccessToken()).toBe(SECRET);
  });
});

describe('Trạng thái kết nối (GET /api/ads/status → state)', () => {
  it('chưa có token → never; có token → connected; TikTok từ chối gia hạn → lost', async () => {
    const { tiktokState } = await import('../server/routes/ads');
    expect(tiktokState(tAuth.readToken())).toBe('never');
    tAuth.saveToken({ client_id: 'c', access_token: 'a', refresh_token: 'r', expires_in: 1 });
    expect(tiktokState(tAuth.readToken())).toBe('connected');
    refreshMode = 'reject';
    await tAuth.getAccessToken(true).catch(() => {});
    expect(tiktokState(tAuth.readToken())).toBe('lost');
  });
});

describe('Ngắt kết nối', () => {
  const connected = () => tAuth.saveToken({ client_id: 'client-9', access_token: SECRET, refresh_token: 'r-bi-mat', expires_in: 86399 });

  it('thu hồi refresh_token + access_token ở TikTok rồi xoá token → never', async () => {
    connected();
    const r = await flow.disconnect(SEP);
    expect(r).toEqual({ revoked: true });
    const revokes = calls.filter((c) => c.url === 'https://tt.invalid/revoke').map((c) => new URLSearchParams(c.body));
    expect(revokes.map((b) => [b.get('token_type_hint'), b.get('token'), b.get('client_id')])).toEqual([
      ['refresh_token', 'r-bi-mat', 'client-9'],
      ['access_token', SECRET, 'client-9'],
    ]);
    expect(fs.existsSync(tokenFile())).toBe(false);
    const { tiktokState } = await import('../server/routes/ads');
    expect(tiktokState(tAuth.readToken())).toBe('never');
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });

  it('TikTok lỗi / rớt mạng → vẫn xoá token trên máy, revoked: false', async () => {
    for (const mode of ['error', 'network'] as const) {
      connected();
      revokeMode = mode;
      expect(await flow.disconnect(SEP)).toEqual({ revoked: false });
      expect(fs.existsSync(tokenFile())).toBe(false);
    }
  });

  it('POST /disconnect cần quyền configure', () => {
    const layer = (tiktokRouter.stack as { route?: { path: string; stack: { handle: { permission?: string } }[] } }[]).find(
      (l) => l.route?.path === '/disconnect',
    );
    expect(layer?.route?.stack.map((s) => s.handle.permission).find(Boolean)).toBe('configure');
  });

  it('thiếu confirm → 400, không ngắt', async () => {
    connected();
    const layer = (tiktokRouter.stack as { route?: { path: string; stack: { handle: (req: unknown, res: unknown, next: () => void) => unknown }[] } }[]).find(
      (l) => l.route?.path === '/disconnect',
    )!;
    const handler = layer.route!.stack[layer.route!.stack.length - 1].handle;
    const res = { code: 0, status(c: number) { res.code = c; return res; }, json() { return res; } };
    await handler({ body: {} }, res, () => {});
    expect(res.code).toBe(400);
    expect(fs.existsSync(tokenFile())).toBe(true);
  });
});
