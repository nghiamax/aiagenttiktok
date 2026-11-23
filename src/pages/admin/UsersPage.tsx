import { useCallback, useEffect, useState } from 'react';
import { Crown, Loader2, Lock, Pencil, RotateCcw, Trash2, Unlock, UserCog, UserPlus } from 'lucide-react';
import Card from '../../components/ui/Card';
import PageHeader from '../../components/ui/PageHeader';
import { useAuth } from '../../auth/AuthProvider';
import { api, ApiError } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import UserFormModal from './UserFormModal';
import BillingAdmin from './BillingAdmin';
import type { AdminUser } from './types';

const dateVi = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

const iconBtn =
  'flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-canvas hover:text-ink disabled:opacity-40';

/** Trang Tài khoản (Chủ shop): thêm người dùng, đổi gói Miễn phí / Pro, khoá, đặt lại lượt */
export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers((await api<{ users: AdminUser[] }>('/users')).users);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được danh sách');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (u: AdminUser) =>
    setUsers((list) =>
      list?.some((x) => x.id === u.id) ? list.map((x) => (x.id === u.id ? u : x)) : [...(list ?? []), u],
    );

  const act = async (u: AdminUser, run: () => Promise<{ user: AdminUser }>) => {
    setBusyId(u.id);
    setError(null);
    try {
      replace((await run()).user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không thực hiện được');
    } finally {
      setBusyId(null);
    }
  };

  const toggleLock = (u: AdminUser) => {
    if (!u.disabled && !window.confirm(`Khoá @${u.username}? Tài khoản sẽ bị đăng xuất ngay.`)) return;
    void act(u, () => api(`/users/${u.id}`, { method: 'PATCH', body: { disabled: !u.disabled } }));
  };
  const resetUsage = (u: AdminUser) => {
    if (!window.confirm(`Đặt lại số lượt đã dùng của @${u.username} về 0?`)) return;
    void act(u, () => api(`/users/${u.id}/reset-usage`, { method: 'POST', body: {} }));
  };
  /** Xoá hẳn tài khoản (không hoàn tác) — hỏi lại bằng cách gõ tên đăng nhập */
  const remove = async (u: AdminUser) => {
    const typed = window.prompt(
      `Xoá vĩnh viễn tài khoản @${u.username}? Không hoàn tác được — tài khoản bị đăng xuất, mất gói và số lượt.\n\nGõ "${u.username}" để xác nhận:`,
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== u.username) {
      setError('Tên đăng nhập không khớp — chưa xoá.');
      return;
    }
    setBusyId(u.id);
    setError(null);
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' });
      setUsers((list) => list?.filter((x) => x.id !== u.id) ?? list);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không xoá được');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        icon={UserCog}
        title="Tài khoản"
        description="3 loại tài khoản: Quản trị viên · Miễn phí · Pro. Khách tự mua Pro bằng chuyển khoản — tiền về là tự lên Pro."
        actions={
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover"
          >
            <UserPlus className="size-4" /> Thêm tài khoản
          </button>
        }
      />

      {error && <p className="mb-4 rounded-xl bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}

      <Card className="overflow-x-auto">
        {!users ? (
          <div className="flex items-center justify-center gap-2 p-10 text-muted">
            <Loader2 className="size-5 animate-spin" /> Đang tải…
          </div>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="px-4 py-3 font-medium">Tài khoản</th>
                <th className="px-4 py-3 font-medium">Loại tài khoản</th>
                <th className="px-4 py-3 font-medium">Đã dùng (miễn phí)</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3" aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => {
                const self = u.id === me?.id;
                const q = u.quota;
                const proExpired = u.plan === 'pro' && u.activePlan === 'free';
                return (
                  <tr key={u.id} className={u.disabled ? 'bg-canvas/60 text-muted' : ''}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">
                        {u.name}
                        {self && <span className="ml-1.5 text-xs font-medium text-muted">(bạn)</span>}
                      </p>
                      <p className="text-muted">@{u.username}</p>
                    </td>
                    <td className="px-4 py-3">
                      {u.role === 'owner' ? (
                        <span className="rounded-md bg-ink px-2 py-0.5 font-semibold text-white">Quản trị viên</span>
                      ) : u.activePlan === 'pro' ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-accent-violet/10 px-2 py-0.5 font-semibold text-accent-violet">
                          <Crown className="size-3.5" /> Pro
                        </span>
                      ) : (
                        <span className="rounded-md bg-canvas px-2 py-0.5 font-medium text-ink">Miễn phí</span>
                      )}
                      {u.role !== 'owner' && (u.proUntil || proExpired) && (
                        <p className={`mt-0.5 text-xs ${proExpired ? 'text-danger' : 'text-muted'}`}>
                          {proExpired ? 'Pro hết hạn ' : 'đến '}
                          {u.proUntil && dateVi(u.proUntil)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {q.unlimited ? (
                        <span className="text-muted">Không giới hạn</span>
                      ) : (
                        <span className="block leading-5">
                          <span className={q.remaining === 0 ? 'font-semibold text-danger' : ''}>
                            Tính giá {formatNumber(q.used)}/{formatNumber(q.limit ?? 0)}
                          </span>
                          <br />
                          <span className={q.profitRemaining === 0 ? 'font-semibold text-danger' : 'text-muted'}>
                            Lợi nhuận {formatNumber(q.profitUsed)}/{formatNumber(q.profitLimit ?? 0)} đơn
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.disabled ? (
                        <span className="font-medium text-danger">Đã khoá</span>
                      ) : (
                        <span className="text-accent-green">Hoạt động</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {busyId === u.id && <Loader2 className="m-2 size-4 animate-spin text-muted" />}
                        <button
                          type="button"
                          className={iconBtn}
                          aria-label={`Sửa @${u.username}`}
                          title="Sửa / đổi gói / đặt lại mật khẩu"
                          onClick={() => setEditing(u)}
                        >
                          <Pencil className="size-4" />
                        </button>
                        {!q.unlimited && (q.used > 0 || q.profitUsed > 0) && (
                          <button
                            type="button"
                            className={iconBtn}
                            aria-label={`Đặt lại lượt của @${u.username}`}
                            title="Đặt lại lượt đã dùng"
                            onClick={() => resetUsage(u)}
                          >
                            <RotateCcw className="size-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          className={iconBtn}
                          disabled={self}
                          aria-label={u.disabled ? `Mở khoá @${u.username}` : `Khoá @${u.username}`}
                          title={self ? 'Không tự khoá tài khoản đang dùng' : u.disabled ? 'Mở khoá' : 'Khoá'}
                          onClick={() => toggleLock(u)}
                        >
                          {u.disabled ? <Unlock className="size-4" /> : <Lock className="size-4" />}
                        </button>
                        <button
                          type="button"
                          className={`${iconBtn} hover:bg-danger/10 hover:text-danger`}
                          disabled={self}
                          aria-label={`Xoá @${u.username}`}
                          title={self ? 'Không tự xoá tài khoản đang dùng' : 'Xoá tài khoản'}
                          onClick={() => void remove(u)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <BillingAdmin onPaid={() => void load()} />

      {editing && me && (
        <UserFormModal
          user={editing === 'new' ? null : editing}
          selfId={me.id}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            replace(u);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
