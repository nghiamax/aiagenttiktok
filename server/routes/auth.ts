import { Router } from 'express';
import { permissionsOf } from '../../shared/permissions.js';
import { clearFails, lockedFor, recordFail, requireAuth } from '../auth/middleware.js';
import { clearCookie, createSession, destroySession, destroyUserSessions, readCookie, sessionCookie } from '../auth/sessions.js';
import { checkPassword, findUserById, publicUser, setPassword, UserError, verifyLogin } from '../auth/users.js';
import { SignupLimitError, signup, signupEnabled } from '../auth/signup.js';
import { TRIAL_DAYS } from '../../shared/plans.js';

/** /api/auth — đăng nhập web (cookie phiên HttpOnly) */
export const authRouter = Router();

const str = (v: unknown) => (typeof v === 'string' ? v : '');

authRouter.post('/login', (req, res) => {
  const username = str(req.body?.username).trim();
  const password = str(req.body?.password);
  if (!username || !password) return res.status(400).json({ code: 'BAD_REQUEST', error: 'Nhập tên đăng nhập và mật khẩu' });
  const ip = req.ip ?? 'unknown';
  const wait = lockedFor(ip, username);
  if (wait > 0) {
    return res.status(429).json({ code: 'LOGIN_LOCKED', error: `Sai nhiều lần — thử lại sau ${Math.ceil(wait / 60_000)} phút`, retryAfterMs: wait });
  }
  const user = verifyLogin(username, password);
  if (!user) {
    recordFail(ip, username);
    return res.status(401).json({ code: 'LOGIN_FAILED', error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
  clearFails(ip, username);
  res.setHeader('Set-Cookie', sessionCookie(createSession(user.id, req.get('user-agent'))));
  res.json({ user: publicUser(user), permissions: permissionsOf(user.role) });
});

/** Web hỏi trước khi hiện nút Đăng ký dùng thử */
authRouter.get('/options', (_req, res) => {
  res.json({ signup: signupEnabled(), trialDays: TRIAL_DAYS });
});

/** Tự đăng ký dùng thử → tài khoản khách riêng + Pro TRIAL_DAYS ngày, đăng nhập luôn */
authRouter.post('/register', (req, res) => {
  if (!signupEnabled()) return res.status(403).json({ code: 'SIGNUP_DISABLED', error: 'Hiện chưa mở đăng ký — liên hệ quản trị viên để được cấp tài khoản' });
  try {
    const user = signup(
      { username: str(req.body?.username).trim(), name: str(req.body?.name), password: str(req.body?.password) },
      req.ip ?? 'unknown',
    );
    res.setHeader('Set-Cookie', sessionCookie(createSession(user.id, req.get('user-agent'))));
    res.status(201).json({ user: publicUser(user), permissions: permissionsOf(user.role) });
  } catch (e) {
    if (e instanceof SignupLimitError) return res.status(429).json({ code: 'SIGNUP_LIMIT', error: e.message });
    if (e instanceof UserError) return res.status(400).json({ code: 'BAD_SIGNUP', error: e.message });
    throw e;
  }
});

authRouter.post('/logout', (req, res) => {
  destroySession(readCookie(req.get('cookie')));
  res.setHeader('Set-Cookie', clearCookie());
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user, permissions: permissionsOf(req.user!.role) });
});

/** Đổi mật khẩu: giữ phiên đang dùng, đăng xuất mọi nơi khác */
authRouter.post('/password', requireAuth, (req, res) => {
  const current = str(req.body?.current);
  const next = str(req.body?.next);
  const user = findUserById(req.user!.id);
  if (!user || !checkPassword(current, user.passwordHash)) {
    return res.status(400).json({ code: 'WRONG_PASSWORD', error: 'Mật khẩu hiện tại không đúng' });
  }
  try {
    setPassword(user.id, next);
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ code: 'BAD_PASSWORD', error: e.message });
    throw e;
  }
  destroyUserSessions(user.id, readCookie(req.get('cookie')));
  res.json({ ok: true });
});
