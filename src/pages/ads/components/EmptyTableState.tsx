import { Inbox } from 'lucide-react';

interface EmptyTableStateProps {
  title: string;
  description: string;
}

export default function EmptyTableState({ title, description }: EmptyTableStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Inbox className="size-6" strokeWidth={1.75} />
      </div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted">{description}</p>
    </div>
  );
}
