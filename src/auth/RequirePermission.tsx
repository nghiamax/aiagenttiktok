import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Lock, LogIn } from 'lucide-react';
import type { Permission } from '../../shared/permissions';
import { homePath } from '../config/navigation';
import { useAuth } from './AuthProvider';

interface RequirePermissionProps {
  permission: Permission;
  children: ReactNode;
  /**
   * Khi chưa đăng nhập: `preview` = vẫn hiện trang (ô không có dữ liệu, bấm → đăng nhập);
   * `locked` = trang riêng tư (gói, tài khoản, quản lý shop) → chỉ hiện thẻ "Đăng nhập để xem".
   */
  guest?: 'preview' | 'locked';
}

/** Trang cần quyền `permission`; đã đăng nhập mà không có → về trang đầu tiên tài khoản được dùng */
export default function RequirePermission({ permission, children, guest: guestMode = 'preview' }: RequirePermissionProps) {
  const { can, guest } = useAuth();
  if (guest) return guestMode === 'locked' ? <GuestLockedCard /> : <>{children}</>;
  if (!can(permission)) return <Navigate to={homePath(can)} replace />;
  return <>{children}</>;
}

/** "/" → trang đầu tiên tài khoản được dùng (Chủ shop: ADS, Người dùng: Tài chính; khách: Quản lí chiến dịch) */
export function HomeRedirect() {
  const { can, guest } = useAuth();
  return <Navigate to={guest ? '/ads' : homePath(can)} replace />;
}

/** Trang riêng tư khi chưa đăng nhập */
function GuestLockedCard() {
  const { promptLogin } = useAuth();
  return (
    <div className="flex flex-col items-center rounded-2xl border border-line bg-white px-6 py-16 text-center shadow-sm">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Lock className="size-6" />
      </div>
      <p className="text-lg font-semibold">Đăng nhập để xem trang này</p>
      <p className="mt-1 max-w-md text-sm text-muted">Trang này chứa thông tin riêng của tài khoản.</p>
      <button
        type="button"
        data-guest-allow
        onClick={() => promptLogin()}
        className="mt-5 flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover"
      >
        <LogIn className="size-4" />
        Đăng nhập
      </button>
    </div>
  );
}
