import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { Permission } from '../../shared/permissions';
import { homePath } from '../config/navigation';
import { useAuth } from './AuthProvider';

/** Trang cần quyền `permission`; không có → về trang đầu tiên tài khoản được dùng */
export default function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) return <Navigate to={homePath(can)} replace />;
  return <>{children}</>;
}

/** "/" → trang đầu tiên tài khoản được dùng (Chủ shop: ADS, Người dùng: Tài chính) */
export function HomeRedirect() {
  const { can } = useAuth();
  return <Navigate to={homePath(can)} replace />;
}
