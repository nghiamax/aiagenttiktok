import { Building2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import AccountPicker from './AccountPicker';
import Card from './Card';

/** Đã kết nối TikTok nhưng chưa chọn tài khoản quảng cáo (token được quyền nhiều tài khoản) */
export default function ChooseAccountCard() {
  const canChoose = useAuth().can('configure');
  return (
    <Card className="mx-auto max-w-2xl p-6 md:p-8">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Building2 className="size-6" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Chọn tài khoản quảng cáo</h2>
          <p className="text-muted">
            {canChoose ? 'TikTok cho phép nhiều tài khoản — chọn tài khoản + shop mà shop này quản lý.' : 'Nhờ chủ tài khoản chọn tài khoản quảng cáo cho shop.'}
          </p>
        </div>
      </div>
      {canChoose && <AccountPicker />}
    </Card>
  );
}
