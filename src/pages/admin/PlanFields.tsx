import type { Role } from '../../../shared/permissions';
import { FREE_PRICING_CALCS, FREE_PROFIT_ORDERS, type Plan } from '../../../shared/plans';
import { PRO_DAYS, proDaysLabel } from './types';

export const inputCls =
  'w-full rounded-lg border border-line px-3 py-2 text-[15px] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';
export const labelCls = 'mb-1 block text-sm font-medium';

/** 3 loại tài khoản (Sếp chốt 22/11): Quản trị viên · Miễn phí · Pro */
export type AccountType = 'admin' | 'free' | 'pro';

export const accountTypeOf = (role: Role, plan: Plan): AccountType =>
  role === 'owner' ? 'admin' : plan === 'pro' ? 'pro' : 'free';

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = { admin: 'Quản trị viên', free: 'Miễn phí', pro: 'Pro' };

const HINT: Record<AccountType, string> = {
  admin: 'Toàn quyền: chạy ADS, sửa thiết lập, quản lý tài khoản và thanh toán.',
  free: `Tính giá bán ${FREE_PRICING_CALCS} lượt, Tính lợi nhuận ${FREE_PROFIT_ORDERS} đơn. Không có Tính hàng loạt.`,
  pro: 'Tính giá bán + Tính lợi nhuận không giới hạn, có Tính hàng loạt.',
};

interface AccountTypeFieldsProps {
  type: AccountType;
  proDays: number;
  onType: (t: AccountType) => void;
  onProDays: (d: number) => void;
  /** Không cho đổi loại (tài khoản đang dùng) */
  locked?: boolean;
  /** Đang sửa → ghi chú hạn Pro tính lại từ hôm nay */
  editing?: boolean;
}

const chip = (on: boolean) =>
  `rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
    on ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink hover:border-primary/40'
  }`;

/** Loại tài khoản + thời hạn Pro — dùng ở hộp Thêm và Sửa tài khoản */
export default function AccountTypeFields({
  type,
  proDays,
  onType,
  onProDays,
  locked = false,
  editing = false,
}: AccountTypeFieldsProps) {
  return (
    <div>
      <p className={labelCls}>Loại tài khoản</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Loại tài khoản">
        {(['free', 'pro', 'admin'] as AccountType[]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            disabled={locked}
            onClick={() => onType(t)}
            className={chip(type === t)}
          >
            {ACCOUNT_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <p className="mt-1 text-sm text-muted">{locked ? 'Không tự đổi loại tài khoản của chính mình.' : HINT[type]}</p>
      {type === 'pro' && !locked && (
        <div className="mt-2">
          <p className="mb-1 text-sm text-muted">Thời hạn Pro{editing ? ' (tính lại từ hôm nay)' : ''}</p>
          <div className="flex flex-wrap gap-2">
            {PRO_DAYS.map((d) => (
              <button key={d} type="button" onClick={() => onProDays(d)} className={chip(proDays === d)}>
                {proDaysLabel(d)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
