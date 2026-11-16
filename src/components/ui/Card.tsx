import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-line bg-white shadow-sm transition-all duration-200 hover:shadow-md ${className}`}
    >
      {children}
    </div>
  );
}
