import { useState, type FormEvent } from 'react';
import Modal from '../../components/ui/Modal';
import { api, ApiError } from '../../lib/api';
import { MIN_PASSWORD_LENGTH } from '../../../shared/permissions';
import AccountTypeFields, { accountTypeOf, inputCls, labelCls, type AccountType } from './PlanFields';
import type { AdminUser } from './types';

interface UserFormModalProps {
  /** null = thêm tài khoản mới */
  user: AdminUser | null;
  /** Tài khoản đang đăng nhập (không tự đổi vai trò) */
  selfId: string;
  onClose: () => void;
  onSaved: (u: AdminUser) => void;
}

/** Thêm / sửa tài khoản: tên, vai trò, gói; mật khẩu (bắt buộc khi thêm, tuỳ chọn khi sửa = đặt lại) */
export default function UserFormModal({ user, selfId, onClose, onSaved }: UserFormModalProps) {
  const isNew = !user;
  const [username, setUsername] = useState('');
  const [name, setName] = useState(user?.name ?? '');
  const [password, setPassword] = useState('');
  const [type, setType] = useState<AccountType>(user ? accountTypeOf(user.role, user.plan) : 'free');
  const [proDays, setProDays] = useState(30);
  /** Đã bấm đổi loại / thời hạn — sửa tên không làm đổi hạn Pro */
  const [typeTouched, setTypeTouched] = useState(false);
  // Quản trị viên = role owner; Miễn phí / Pro = Người dùng + gói
  const role = type === 'admin' ? 'owner' : 'user';
  const plan = type === 'pro' ? 'pro' : 'free';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if ((isNew || password) && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Mật khẩu cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let saved: AdminUser;
      if (isNew) {
        saved = (
          await api<{ user: AdminUser }>('/users', {
            method: 'POST',
            body: { username, name, role, plan, proDays, password },
          })
        ).user;
      } else {
        // Loại / gói chỉ gửi khi đã bấm đổi (Pro tính lại hạn từ hôm nay)
        saved = (
          await api<{ user: AdminUser }>(`/users/${user.id}`, {
            method: 'PATCH',
            body: { name, ...(typeTouched ? { role, plan, proDays } : {}) },
          })
        ).user;
        if (password) await api(`/users/${user.id}/password`, { method: 'POST', body: { password } });
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không lưu được');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isNew ? 'Thêm tài khoản' : `Sửa tài khoản @${user.username}`}
      description={isNew ? 'Người dùng đăng nhập bằng tên + mật khẩu này.' : undefined}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        {isNew && (
          <div>
            <label className={labelCls} htmlFor="user-username">
              Tên đăng nhập
            </label>
            <input
              id="user-username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              autoComplete="off"
              placeholder="vd: khach01"
              className={inputCls}
              required
            />
            <p className="mt-1 text-sm text-muted">3–32 ký tự: chữ thường, số, dấu . _ -</p>
          </div>
        )}
        <div>
          <label className={labelCls} htmlFor="user-name">
            Tên hiển thị
          </label>
          <input id="user-name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="user-password">
            {isNew ? 'Mật khẩu' : 'Mật khẩu mới (để trống nếu không đổi)'}
          </label>
          <input
            id="user-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className={inputCls}
            required={isNew}
          />
          {!isNew && password && <p className="mt-1 text-sm text-muted">Tài khoản này sẽ bị đăng xuất ở mọi nơi.</p>}
        </div>

        <AccountTypeFields
          type={type}
          proDays={proDays}
          onType={(t) => {
            setType(t);
            setTypeTouched(true);
          }}
          onProDays={(d) => {
            setProDays(d);
            setTypeTouched(true);
          }}
          locked={user?.id === selfId}
          editing={!isNew && user.plan === 'pro'}
        />

        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? 'Đang lưu…' : isNew ? 'Tạo tài khoản' : 'Lưu'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
