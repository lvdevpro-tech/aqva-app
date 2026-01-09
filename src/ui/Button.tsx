import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'whatsapp' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-semibold';

  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'bg-[var(--aqva-green)] hover:bg-[#00bc7d] text-white shadow-lg shadow-black/25',
    secondary: 'bg-[var(--aqva-cyan)] hover:bg-[#00b8d4] text-white shadow-lg shadow-black/25',
    whatsapp: 'bg-[var(--aqva-whatsapp)] hover:bg-[#20bd5a] text-white shadow-lg shadow-black/25',
    ghost: 'bg-transparent hover:bg-white/10 text-white border border-white/20',
    danger: 'bg-[#f97316] hover:bg-[#ea580c] text-white shadow-lg shadow-black/25',
  };

  const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base',
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
