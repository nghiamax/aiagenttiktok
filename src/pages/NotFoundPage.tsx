import { Link } from 'react-router-dom';
import Card from '../components/ui/Card';

export default function NotFoundPage() {
  return (
    <Card className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
      <p className="text-4xl font-bold text-primary">404</p>
      <h1 className="mt-2 text-lg font-semibold">Không tìm thấy trang</h1>
      <p className="mt-1.5 text-muted">Đường dẫn không tồn tại hoặc đã bị thay đổi.</p>
      <Link
        to="/ads"
        className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
      >
        Về trang ADS 24/7
      </Link>
    </Card>
  );
}
