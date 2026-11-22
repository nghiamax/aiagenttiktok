import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';

/** Tab được mở từ nút Kết nối thì thử tự đóng sau ngần này */
const AUTO_CLOSE_MS = 3000;

/**
 * TikTok chuyển về đây sau khi cho phép (không cần đăng nhập web — có thể là tab mới hoặc trình duyệt khác).
 * Tab quản lý ban đầu tự tải lại khi kết nối xong; tab này chỉ báo kết quả.
 */
export default function TikTokDonePage() {
  const [params] = useSearchParams();
  const error = params.get('error');
  const [closeFailed, setCloseFailed] = useState(false);

  // Thành công + tab do trang web mở (window.opener) → tự đóng; đóng không được thì để người dùng tự đóng
  useEffect(() => {
    if (error || !window.opener) return;
    const t = setTimeout(() => {
      window.close();
      setCloseFailed(true);
    }, AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-8 text-center shadow-sm">
        {error ? (
          <>
            <XCircle className="mx-auto size-12 text-danger" strokeWidth={1.75} />
            <h1 className="mt-4 text-xl font-bold">Chưa kết nối được TikTok</h1>
            <p className="mt-2 leading-relaxed text-muted">{error}</p>
          </>
        ) : (
          <>
            <CheckCircle2 className="mx-auto size-12 text-accent-green" strokeWidth={1.75} />
            <h1 className="mt-4 text-xl font-bold">Đã kết nối TikTok</h1>
            <p className="mt-2 leading-relaxed text-muted">
              Quay lại tab quản lý — trang tự cập nhật. {window.opener && !closeFailed ? 'Tab này sẽ tự đóng.' : 'Có thể đóng tab này.'}
            </p>
          </>
        )}
        <div className="mt-6 flex justify-center gap-2">
          {!error && (
            <button
              type="button"
              onClick={() => window.close()}
              className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink"
            >
              Đóng tab
            </button>
          )}
          <Link to="/ads" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover">
            Mở trang quản lý
          </Link>
        </div>
      </div>
    </main>
  );
}
