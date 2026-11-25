import { describe, expect, it } from 'vitest';
import { defaultSystemFees, normalizeSystemFees } from '../shared/platformFees';

describe('Biểu phí cố định của sàn (hệ thống, chỉ Quản trị viên sửa)', () => {
  it('mặc định TikTok: phí giao dịch 6% + phí xử lý đơn 3.000đ/đơn; Shopee trống', () => {
    const d = defaultSystemFees();
    expect(d.tables['tiktok:standard']).toEqual([
      expect.objectContaining({ label: 'Phí giao dịch', kind: 'pct', value: 6 }),
      expect.objectContaining({ label: 'Phí xử lý đơn hàng', kind: 'fixed', value: 3000 }),
      // chương trình tuỳ chọn: chỉ tính khi shop có đăng ký
      expect.objectContaining({
        label: 'Chương trình Hoàn phí vận chuyển',
        kind: 'fixed',
        value: 1620,
        optional: true,
      }),
    ]);
    expect(d.tables['tiktok:mall']).toHaveLength(3);
    expect(d.tables['shopee:standard']).toEqual([]);
  });

  it('bỏ dòng hỏng (không tên, âm, % ≥ 100), giữ bảng thiếu = mặc định', () => {
    const r = normalizeSystemFees({
      tables: {
        'shopee:standard': [
          { id: 'a', label: 'Phí xử lý giao dịch', kind: 'pct', value: 4.91 },
          { id: 'b', label: '', kind: 'pct', value: 1 },
          { id: 'c', label: 'Âm', kind: 'fixed', value: -1 },
          { id: 'd', label: 'Quá', kind: 'pct', value: 120 },
        ],
      },
    });
    expect(r.tables['shopee:standard']).toEqual([{ id: 'a', label: 'Phí xử lý giao dịch', kind: 'pct', value: 4.91 }]);
    expect(r.tables['tiktok:standard']).toHaveLength(3);
  });
});
