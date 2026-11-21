/**
 * Vai trò + quyền người dùng web (dùng chung web + server). Kiểm tra quyền chỉ ở 1 chỗ: `can()`.
 * Hiện chỉ có Chủ shop; thêm nhân viên sau này = thêm tài khoản `staff` (+ chỉnh bảng dưới nếu cần).
 */

export type Role = 'owner' | 'staff';

export type Permission =
  /** Xem số liệu, Agent, Nhật ký */
  | 'view'
  /** Chạy thật trên TikTok: Duyệt / Bỏ qua đề xuất, Gỡ / Thêm lại / Tăng cường, Hoàn tác, Kiểm tra ngay */
  | 'execute'
  /** Sửa ROI hoà vốn, nhóm, quy tắc, giới hạn an toàn, bật/tắt Agent, Quét ngay */
  | 'configure'
  /** Quản lý tài khoản người dùng (trang quản trị — chưa làm) */
  | 'manage_users';

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ['view', 'execute', 'configure', 'manage_users'],
  staff: ['view'],
};

export const ROLE_LABEL: Record<Role, string> = { owner: 'Chủ shop', staff: 'Nhân viên' };

export const ROLES = Object.keys(ROLE_PERMISSIONS) as Role[];

export const isRole = (v: unknown): v is Role => typeof v === 'string' && v in ROLE_PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && (ROLE_PERMISSIONS[role]?.includes(permission) ?? false);
}

export function permissionsOf(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

/** Thông tin người dùng trả về web (không có mật khẩu) */
export interface PublicUser {
  id: string;
  username: string;
  name: string;
  role: Role;
}

/** Người bấm — ghi vào Nhật ký / đề xuất */
export interface ActorRef {
  id: string;
  name: string;
}

/** Mật khẩu tối thiểu */
export const MIN_PASSWORD_LENGTH = 8;
