import type { ReactNode } from 'react';
import { cn } from './utils';

export function Card({
  children,
  className,
  bordered = true,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  bordered?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        bordered ? 'aqva-card' : 'aqva-card-strong',
        'p-6 transition-all duration-200',
        onClick ? 'cursor-pointer hover:border-[rgba(94,233,181,0.45)] hover:shadow-lg hover:shadow-black/25' : '',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('text-xl font-semibold tracking-wide', className)}>{children}</div>;
}

export function CardSubtitle({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('text-sm text-[var(--aqva-text-muted)]', className)}>{children}</div>;
}
