import { Router, type Response } from 'express';
import { isRole, type Role } from '../../shared/permissions.js';
import { effectivePlan, isPlan, quotaOf } from '../../shared/plans.js';
import { requirePermission } from '../auth/middleware.js';
import { destroyUserSessions } from '../auth/sessions.js';
import {
  createUser,
  deleteUser,
  findUserById,
  listUsers,
  publicUser,
  setDisabled,
  setName,
  setPassword,
  setPlan,
  setRole,
  UserError,
  type StoredUser,
} from '../auth/users.js';
import { allPricingUsage, allProfitUsage, pricingUsed, profitOrdersUsed, resetPricingUsage } from '../finance/usage.js';
import { deleteCosts } from '../finance/costs.js';
import { deleteSellerData } from '../sellerBrowser/session.js';

/** /api/users — trang Tài khoản (chỉ quyền manage_users = Chủ shop) */
export const usersRouter = Router();

const DAY_MS = 86_400_000;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function view(u: StoredUser, used: number, profitUsed = 0) {
  const pub = publicUser(u);
  return {
    ...pub,
    disabled: u.disabled,
    createdAt: u.createdAt,
    quota: quotaOf(pub, used, Date.now(), profitUsed),
    activePlan: effectivePlan(pub),
  };
}

/** Số ngày Pro → hạn (ISO); 0 / trống = không hạn */
function proUntilFrom(days: unknown): string | null {
  const n = Number(days);
  return Number.isFinite(n) && n > 0 ? new Date(Date.now() + Math.round(n) * DAY_MS).toISOString() : null;
}

const activeOwners = (exceptId?: string) => listUsers().filter((u) => u.role === 'owner' && !u.disabled && u.id !== exceptId);

function fail(res: Response, e: unknown) {
  if (e instanceof UserError) return res.status(400).json({ code: 'BAD_REQUEST', error: e.message });
  throw e;
}

usersRouter.get('/', requirePermission('manage_users'), (_req, res) => {
  const usage = allPricingUsage();
  const profit = allProfitUsage();
  res.json({ users: listUsers().map((u) => view(u, usage[u.id] ?? 0, profit[u.id] ?? 0)) });
});

usersRouter.post('/', requirePermission('manage_users'), (req, res) => {
  const b = req.body ?? {};
  const role = (b.role ?? 'user') as Role;
  const plan = b.plan ?? 'free';
  if (!isRole(role) || !isPlan(plan)) return res.status(400).json({ code: 'BAD_REQUEST', error: 'Vai trò / gói không hợp lệ' });
  try {
    const u = createUser({
      username: str(b.username),
      name: str(b.name),
      role,
      plan,
      proUntil: plan === 'pro' ? proUntilFrom(b.proDays) : null,
      password: str(b.password),
    });
    res.json({ user: view(u, 0) });
  } catch (e) {
    fail(res, e);
  }
});

/** Sửa: name · role · plan (+ proDays) · disabled */
usersRouter.patch('/:id', requirePermission('manage_users'), (req, res) => {
  const target = findUserById(req.params.id);
  if (!target) return res.status(404).json({ code: 'NOT_FOUND', error: 'Không tìm thấy tài khoản' });
  const b = req.body ?? {};
  const self = target.id === req.user!.id;
  try {
    if (b.role !== undefined && b.role !== target.role) {
      if (!isRole(b.role)) throw new UserError('Vai trò không hợp lệ');
      if (self) throw new UserError('Không tự đổi vai trò của chính mình');
      if (target.role === 'owner' && activeOwners(target.id).length === 0) throw new UserError('Cần giữ ít nhất 1 Chủ shop');
      setRole(target.id, b.role);
    }
    if (b.disabled !== undefined && !!b.disabled !== target.disabled) {
      if (b.disabled && self) throw new UserError('Không tự khoá tài khoản đang dùng');
      if (b.disabled && target.role === 'owner' && activeOwners(target.id).length === 0) {
        throw new UserError('Cần giữ ít nhất 1 Chủ shop');
      }
      setDisabled(target.id, !!b.disabled);
      if (b.disabled) destroyUserSessions(target.id);
    }
    if (b.plan !== undefined) {
      if (!isPlan(b.plan)) throw new UserError('Gói không hợp lệ');
      setPlan(target.id, b.plan, b.plan === 'pro' ? proUntilFrom(b.proDays) : null);
    }
    if (b.name !== undefined) setName(target.id, str(b.name));
    res.json({ user: view(findUserById(target.id)!, pricingUsed(target.id), profitOrdersUsed(target.id).length) });
  } catch (e) {
    fail(res, e);
  }
});

/** Đặt lại mật khẩu → đăng xuất mọi nơi của tài khoản đó */
usersRouter.post('/:id/password', requirePermission('manage_users'), (req, res) => {
  const target = findUserById(req.params.id);
  if (!target) return res.status(404).json({ code: 'NOT_FOUND', error: 'Không tìm thấy tài khoản' });
  try {
    setPassword(target.id, str(req.body?.password));
    if (target.id !== req.user!.id) destroyUserSessions(target.id);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});

/** Xoá hẳn tài khoản: không tự xoá mình, luôn giữ ≥ 1 Quản trị viên đang hoạt động. Đơn mua cũ giữ lại làm lịch sử. */
usersRouter.delete('/:id', requirePermission('manage_users'), (req, res) => {
  const target = findUserById(req.params.id);
  if (!target) return res.status(404).json({ code: 'NOT_FOUND', error: 'Không tìm thấy tài khoản' });
  try {
    if (target.id === req.user!.id) throw new UserError('Không tự xoá tài khoản đang dùng');
    if (target.role === 'owner' && !target.disabled && activeOwners(target.id).length === 0) {
      throw new UserError('Cần giữ ít nhất 1 Quản trị viên');
    }
    deleteUser(target.id);
    destroyUserSessions(target.id);
    resetPricingUsage(target.id);
    deleteCosts(target.id);
    void deleteSellerData(target.id);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});

/** Đặt lại số lượt Tính giá bán + số đơn Tính lợi nhuận đã dùng về 0 (tặng lại lượt miễn phí) */
usersRouter.post('/:id/reset-usage', requirePermission('manage_users'), (req, res) => {
  const target = findUserById(req.params.id);
  if (!target) return res.status(404).json({ code: 'NOT_FOUND', error: 'Không tìm thấy tài khoản' });
  resetPricingUsage(target.id);
  res.json({ user: view(target, 0) });
});
