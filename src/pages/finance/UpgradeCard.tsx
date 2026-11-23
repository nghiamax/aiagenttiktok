import { Crown, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import { FREE_PRICING_CALCS } from '../../../shared/plans';

interface UpgradeCardProps {
  /** used_up = hết lượt tính miễn phí · bulk = Tính hàng loạt chỉ có ở gói Pro */
  reason: 'used_up' | 'bulk';
}

const TEXT = {
  used_up: {
    title: `Đã dùng hết ${FREE_PRICING_CALCS} lượt tính miễn phí`,
    body: 'Nâng cấp gói Pro để tính không giới hạn và dùng Tính hàng loạt.',
  },
  bulk: {
    title: 'Tính hàng loạt dành cho gói Pro',
    body: 'Tải file sản phẩm từ sàn và tính giá, lãi cho từng SKU cùng lúc. Gói Miễn phí dùng được Tìm giá bán và Kiểm tra lãi.',
  },
};

/** Khoá tính năng theo gói → nút sang trang Nâng cấp (mua Pro bằng chuyển khoản) */
export default function UpgradeCard({ reason }: UpgradeCardProps) {
  const t = TEXT[reason];
  return (
    <Card className="p-5 text-center">
      <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-accent-violet/10 text-accent-violet">
        {reason !== 'used_up' ? <Crown className="size-5" /> : <Lock className="size-5" />}
      </span>
      <h3 className="mt-3 font-semibold">{t.title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t.body}</p>
      <Link
        to="/upgrade"
        className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent-violet px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
      >
        <Crown className="size-4" /> Nâng cấp lên Pro
      </Link>
    </Card>
  );
}
