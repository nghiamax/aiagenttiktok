import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import Card from '../../../components/ui/Card';

interface SectionCardProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
  /** Nội dung bên phải tiêu đề */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Card một phần nhập liệu: icon + tiêu đề + gợi ý */
export default function SectionCard({ icon: Icon, title, hint, aside, children, className = '' }: SectionCardProps) {
  return (
    <Card className={`p-4 md:p-5 ${className}`}>
      <div className="mb-3 flex items-start gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink">
          <Icon className="size-4" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-tight">{title}</h3>
          {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </Card>
  );
}
