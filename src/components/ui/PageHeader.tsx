import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  /** Nút / bộ chọn hiển thị bên phải tiêu đề */
  actions?: ReactNode;
}

export default function PageHeader({ title, description, icon: Icon, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:mb-8 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        {Icon && (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Icon className="size-6" strokeWidth={1.9} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
          <p className="mt-1.5 max-w-2xl leading-relaxed text-muted">{description}</p>
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
