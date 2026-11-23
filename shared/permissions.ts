import type { Plan } from './plans.js';

/**
 * Vai trò + quyền người dùng web (dùng chung web + server). Kiểm tra quyền chỉ ở 1 chỗ: `can()`.
 * Hiện chỉ có Chủ shop; thêm nhân viên sau này = thêm tài khoản `staff` (+ chỉnh bảng dưới nếu cần).
 */

/** owner = Chủ shop (quản trị) · staff = Nhân viên shop · user = Người dùng (thấy mọi mục như Nhân viên; mục Tính giá bán giới hạn theo gói) */
export type Role = 'owner' | 'staff' | 'user';

export type Permission =
  /** Xem số liệu, Agent, Nhật ký */
  | 'view'
  /** Chạy thật trên TikTok: Duyệt / Bỏ qua đề xuất, Gỡ / Thêm lại / Tăng cường, Hoàn tác, Kiểm tra ngay */
  | 'execute'
  /** Sửa ROI hoà vốn, nhóm, quy tắc, giới hạn an toàn, bật/tắt Agent, Quét ngay */
  | 'configure'
  /** Quản lý tài khoản người dùng (trang Tài khoản) */
  | 'manage_users'
  /** Dùng mục Tài chính (Tính giá bán / Tính lợi nhuận) — giới hạn theo gói, xem shared/plans.ts */
  | 'finance';

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ['view', 'execute', 'configure', 'manage_users', 'finance'],
  staff: ['view', 'finance'],
  // Người dùng = chủ tài khoản khách: toàn quyền trên CÁC SHOP CỦA MÌNH (requireShop chặn shop người khác)
  user: ['view', 'execute', 'configure', 'finance'],
};

export const ROLE_LABEL: Record<Role, string> = { owner: 'Quản trị viên', staff: 'Nhân viên', user: 'Người dùng' };

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
  /** Gói đã lưu (chưa xét hết hạn — dùng effectivePlan trong shared/plans.ts) */
  plan: Plan;
  /** Hạn gói Pro (ISO); null = không hạn */
  proUntil: string | null;
}

/** Người bấm — ghi vào Nhật ký / đề xuất */
export interface ActorRef {
  id: string;
  name: string;
}

/** Mật khẩu tối thiểu */
export const MIN_PASSWORD_LENGTH = 8;
