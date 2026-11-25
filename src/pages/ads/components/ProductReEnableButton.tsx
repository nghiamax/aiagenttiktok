import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RotateCcw } from 'lucide-react';
import { useNoPermission } from '../../../auth/AuthProvider';
import { useAgentStore, type ExecOutcome } from '../agent/agentStore';
import ConfirmExecuteModal from '../agent/components/ConfirmExecuteModal';
import { useAdsData } from '../data';

interface ProductReEnableButtonProps {
  campaignId: string;
  campaignName: string;
  productId: string;
  productName: string;
  /** Đánh giá "Cân nhắc bật lại" → nút nổi bật */
  suggested: boolean;
}

/**
 * Bật lại sản phẩm đã loại trừ khỏi chiến dịch đang chạy (Sếp yêu cầu 25/11): hộp xác nhận → server chạy thật
 * (`enable_product` = thêm vào item_group_ids), Nhật ký "Thủ công", Hoàn tác được. Server kiểm tra lại điều kiện trước khi gửi.
 */
export default function ProductReEnableButton({ campaignId, campaignName, productId, productName, suggested }: ProductReEnableButtonProps) {
  const { snapshot } = useAdsData();
  const { state, runManual } = useAgentStore();
  const noExec = useNoPermission('execute');
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<ExecOutcome | null>(null);

  // Thao tác bật lại gần nhất sau lần cập nhật số liệu → trạng thái tạm (bảng chưa kịp cập nhật)
  const since = Date.parse(snapshot.updatedAt ?? '') || 0;
  const recent = state.actions.find(
    (a) =>
      a.actionType === 'enable_product' &&
      a.target.campaignId === campaignId &&
      a.target.productId === productId &&
      a.status !== 'failed' &&
      Date.parse(a.executedAt) > since,
  );

  if (recent?.status === 'running') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-primary">
        <Loader2 className="size-3.5 animate-spin" />
        Đang bật lại…
      </span>
    );
  }
  if (recent?.status === 'success') return <span className="text-xs font-medium text-accent-green">Đã bật lại</span>;

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={!!noExec}
        title={noExec ?? 'Bật lại sản phẩm trong chiến dịch (chạy thật trên TikTok, có hộp xác nhận)'}
        onClick={() => setConfirm(true)}
        className={`flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
          suggested ? 'bg-primary text-white hover:bg-primary-hover' : 'border border-line text-muted hover:bg-canvas hover:text-ink'
        }`}
      >
        <RotateCcw className="size-3.5" />
        Bật lại
      </button>
      {result && (
        <span className={`max-w-[200px] text-xs ${result.ok ? 'text-accent-green' : 'text-danger'}`}>
          {result.ok ? 'Đã gửi lên TikTok · ' : `${result.message} · `}
          <Link to="/care-ads/product?view=log" className="font-semibold underline underline-offset-2 hover:text-ink">
            Nhật ký
          </Link>
        </span>
      )}
      {confirm && (
        <ConfirmExecuteModal
          title="Chạy thật trên TikTok?"
          lines={[`Bật lại sản phẩm «${productName}» trong chiến dịch «${campaignName}»`]}
          confirmLabel="Xác nhận"
          onConfirm={async () => setResult(await runManual('enable_product', { campaignId, productId, videoId: '' }))}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
