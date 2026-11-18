import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Dùng làm mốc cuộn tới (scrollIntoView) */
  id?: string;
}

export default function Card({ children, className = '', id }: CardProps) {
  return (
    <div
      id={id}
      className={`rounded-2xl border border-line bg-white shadow-sm transition-all duration-200 hover:shadow-md ${className}`}
    >
      {children}
    </div>
  );
}
