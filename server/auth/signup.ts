import { TRIAL_DAYS } from '../../shared/plans.js';
import { createUser, UserError, type StoredUser } from './users.js';

/*
 * Tự đăng ký dùng thử (trang web bán cho khách): mỗi người đăng ký = 1 tài khoản khách riêng (vai trò `user`,
 * chỉ thấy shop của mình) + gói Pro TRIAL_DAYS ngày, hết hạn tự về Miễn phí.
 * Tắt hẳn bằng biến môi trường SIGNUP=off. Chống tạo hàng loạt: tối đa MAX_SIGNUPS_PER_IP tài khoản / IP / 24 giờ.
 */

export const MAX_SIGNUPS_PER_IP = 3;
const WINDOW_MS = 24 * 3_600_000;
const DAY = 86_400_000;

/** IP → các lần đăng ký thành công trong 24 giờ qua */
const recent = new Map<string, number[]>();

export const signupEnabled = () => (process.env.SIGNUP ?? '').toLowerCase() !== 'off';

export class SignupLimitError extends Error {}

export function signup(
  input: { username: string; name?: string; password: string },
  ip: string,
  now = Date.now(),
): StoredUser {
  const list = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_SIGNUPS_PER_IP) {
    throw new SignupLimitError('Đã tạo nhiều tài khoản từ mạng này hôm nay — thử lại sau 24 giờ');
  }
  const name = input.name?.trim() ?? '';
  if (!name) throw new UserError('Nhập tên hiển thị (tên bạn hoặc tên shop)');
  if (name.length > 60) throw new UserError('Tên hiển thị tối đa 60 ký tự');
  const user = createUser({
    username: input.username,
    name,
    password: input.password,
    role: 'user',
    plan: 'pro',
    proUntil: new Date(now + TRIAL_DAYS * DAY).toISOString(),
  });
  list.push(now);
  recent.set(ip, list);
  return user;
}

/** Chỉ cho test */
export function resetSignupLimits() {
  recent.clear();
}
