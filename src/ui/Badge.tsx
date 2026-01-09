import type { ReactNode } from 'react';
import { cn } from './utils';

interface BadgeProps {
  children: ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  className?: string;
}

export function Badge({ children, variant = 'neutral', className }: BadgeProps) {
  const styles: Record<NonNullable<BadgeProps['variant']>, string> = {
    success: 'bg-[rgba(0,212,146,0.18)] text-[var(--aqva-green-light)] border-[rgba(0,212,146,0.55)]',
    warning: 'bg-[rgba(251,191,36,0.18)] text-yellow-200 border-yellow-500/60',
    error: 'bg-[rgba(239,68,68,0.18)] text-red-200 border-red-500/60',
    info: 'bg-[rgba(0,211,242,0.18)] text-[var(--aqva-cyan-light)] border-[rgba(0,211,242,0.55)]',
    neutral: 'bg-white/10 text-white/80 border-white/25',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-3 py-1 rounded-full text-xs border',
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
