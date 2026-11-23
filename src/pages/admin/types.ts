import type { PublicUser } from '../../../shared/permissions';
import type { FinanceQuota, Plan } from '../../../shared/plans';

/** Tài khoản trên trang quản trị (GET /api/users) */
export interface AdminUser extends PublicUser {
  disabled: boolean;
  createdAt: string;
  quota: FinanceQuota;
  activePlan: Plan;
}

/** Gợi ý thời hạn gói Pro (ngày); 0 = không hạn */
export const PRO_DAYS = [30, 90, 365, 0];
export const proDaysLabel = (d: number) => (d === 0 ? 'Không hạn' : d === 365 ? '1 năm' : `${d} ngày`);
