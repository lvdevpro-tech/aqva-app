import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from './utils';

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-xs text-white/80 mb-1">{children}</div>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('aqva-input w-full text-white placeholder:text-white/35', props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn('aqva-input w-full text-white', props.className)}
    />
  );
}

export function Helper({ children }: { children: ReactNode }) {
  return <div className="text-xs text-white/55 mt-2">{children}</div>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <div className="text-sm text-red-300">{children}</div>;
}

export function SuccessText({ children }: { children: ReactNode }) {
  return <div className="text-sm text-[var(--aqva-green-light)]">{children}</div>;
}
