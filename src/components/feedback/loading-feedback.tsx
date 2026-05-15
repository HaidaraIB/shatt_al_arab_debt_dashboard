import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const sizeClasses = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-8 h-8',
} as const;

export type LoadingSpinnerSize = keyof typeof sizeClasses;

type SpinnerTone = 'muted' | 'primary' | 'inherit';

const toneClass: Record<SpinnerTone, string> = {
  muted: 'text-slate-400',
  primary: 'text-emerald-600',
  inherit: 'text-current',
};

export function LoadingSpinner({
  size = 'md',
  className,
  tone = 'muted',
}: {
  size?: LoadingSpinnerSize;
  className?: string;
  tone?: SpinnerTone;
}) {
  return (
    <Loader2
      className={cn('animate-spin shrink-0', sizeClasses[size], toneClass[tone], className)}
      aria-hidden
    />
  );
}

export function LoadingFeedback({
  message,
  size = 'md',
  className,
  layout = 'stack',
}: {
  message?: string;
  size?: LoadingSpinnerSize;
  className?: string;
  layout?: 'stack' | 'inline';
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center text-slate-600',
        layout === 'stack' ? 'flex-col gap-3' : 'flex-row gap-2',
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <LoadingSpinner size={size} tone="muted" />
      {message ? <p className="text-sm font-medium text-center">{message}</p> : null}
    </div>
  );
}

export function FullscreenLoading({
  message,
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-screen w-full items-center justify-center bg-slate-50',
        className
      )}
      dir="rtl"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <LoadingFeedback message={message} size="lg" layout="stack" />
    </div>
  );
}

export function LoadingOverlay({
  active,
  message,
  className,
  children,
}: {
  active: boolean;
  message?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('relative', className)}>
      {children}
      {active ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-white/75 backdrop-blur-[1px]"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <LoadingFeedback message={message} size="md" layout="stack" className="px-4" />
        </div>
      ) : null}
    </div>
  );
}

export function ButtonLoadingContent({
  loading,
  loadingText = 'جاري الحفظ...',
  spinnerSize = 'sm',
  children,
}: {
  loading: boolean;
  loadingText?: ReactNode;
  spinnerSize?: LoadingSpinnerSize;
  children: ReactNode;
}) {
  if (!loading) return <>{children}</>;
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <LoadingSpinner size={spinnerSize} tone="inherit" />
      {loadingText}
    </span>
  );
}
