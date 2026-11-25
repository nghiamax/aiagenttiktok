import { createContext, useContext } from 'react';
import type { Permission, PublicUser } from '../../shared/permissions';

/*
 * Ngữ cảnh đăng nhập (không có JSX) — file .ts (store, hook) dùng useAuth từ đây; AuthProvider.tsx cung cấp giá trị.
 * Chưa đăng nhập = CHẾ ĐỘ KHÁCH: vẫn ở trong app, các ô không có dữ liệu (provider không gọi API), bấm chức năng → hộp đăng nhập.
 */

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut' | 'offline';

export interface AuthValue {
  status: AuthStatus;
  user: PublicUser | null;
  /** Chưa đăng nhập (kể cả đang tải / server tắt) → không gọi API dữ liệu, ô để trống */
  guest: boolean;
  /** Mở hộp đăng nhập (reason = câu dưới tiêu đề) */
  promptLogin: (reason?: string) => void;
  /** Mở hộp đăng ký dùng thử */
  promptRegister: () => void;
  /** Kiểm tra quyền — dùng để mờ nút; server vẫn kiểm tra lại */
  can: (p: Permission) => boolean;
  login: (username: string, password: string) => Promise<void>;
  /** Tự đăng ký dùng thử → đăng nhập luôn */
  register: (input: { name: string; username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth cần nằm trong AuthProvider');
  return v;
}

/** Lý do không bấm được vì thiếu quyền (null = được) — dùng cho tooltip nút */
export function useNoPermission(p: Permission): string | null {
  const { can } = useAuth();
  return can(p) ? null : 'Tài khoản không có quyền';
}
