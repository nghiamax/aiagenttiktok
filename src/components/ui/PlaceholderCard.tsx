import { Construction } from 'lucide-react';
import Card from './Card';

interface PlaceholderCardProps {
  title?: string;
  description?: string;
}

/** Khu vực nội dung chờ phát triển nghiệp vụ. */
export default function PlaceholderCard({
  title = 'Khu vực đang phát triển',
  description = 'Nội dung chức năng sẽ được bổ sung trong giai đoạn tiếp theo.',
}: PlaceholderCardProps) {
  return (
    <Card className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-canvas text-muted">
        <Construction className="size-7" strokeWidth={1.75} />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-md leading-relaxed text-muted">{description}</p>
    </Card>
  );
}
