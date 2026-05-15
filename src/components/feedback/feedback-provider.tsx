import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  ConfirmContext,
  type ConfirmOptions,
  type SnackbarVariant,
  SnackbarContext,
} from './feedback-context';

type SnackbarItem = {
  id: string;
  message: string;
  variant: SnackbarVariant;
};

const SNACKBAR_MS = 4500;

function SnackbarIcon({ variant }: { variant: SnackbarVariant }) {
  const common = 'w-5 h-5 shrink-0';
  switch (variant) {
    case 'success':
      return <CheckCircle className={cn(common, 'text-emerald-600')} aria-hidden />;
    case 'error':
      return <AlertCircle className={cn(common, 'text-rose-600')} aria-hidden />;
    default:
      return <Info className={cn(common, 'text-sky-600')} aria-hidden />;
  }
}

function SnackbarStack({ items, onDismiss }: { items: SnackbarItem[]; onDismiss: (id: string) => void }) {
  return createPortal(
    <div
      className="fixed bottom-6 left-1/2 z-[150] flex w-[min(100%-2rem,28rem)] -translate-x-1/2 flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-relevant="additions text"
    >
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-lg shadow-slate-900/10',
              item.variant === 'success' && 'border-emerald-200/80',
              item.variant === 'error' && 'border-rose-200/80',
              item.variant === 'info' && 'border-slate-200/80'
            )}
            dir="rtl"
            role="status"
          >
            <SnackbarIcon variant={item.variant} />
            <p className="min-w-0 flex-1 text-right text-sm font-medium leading-relaxed text-slate-800">
              {item.message}
            </p>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="إغلاق"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}

type ConfirmState = ConfirmOptions & { open: boolean };

const defaultConfirmState: ConfirmState = {
  open: false,
  title: '',
  message: '',
  confirmLabel: 'تأكيد',
  cancelLabel: 'إلغاء',
  variant: 'default',
};

function ConfirmDialogView({
  state,
  onResolve,
  titleId,
  descId,
}: {
  state: ConfirmState;
  onResolve: (v: boolean) => void;
  titleId: string;
  descId: string;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!state.open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [state.open]);

  useEffect(() => {
    if (!state.open) return;
    const t = window.setTimeout(() => confirmRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [state.open]);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onResolve(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.open, onResolve]);

  return createPortal(
    <AnimatePresence>
      {state.open && (
        <>
          <motion.button
            key="confirm-backdrop"
            type="button"
            aria-hidden
            tabIndex={-1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[199] bg-slate-900/40 backdrop-blur-[2px]"
            onClick={() => onResolve(false)}
          />
          <div
            key="confirm-shell"
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 pointer-events-none"
            role="presentation"
          >
            <motion.div
              key="confirm-panel"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descId}
              dir="rtl"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="pointer-events-auto w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xl shadow-slate-900/15"
            >
              <h2 id={titleId} className="text-lg font-bold text-slate-900">
                {state.title}
              </h2>
              <p id={descId} className="mt-2 text-right text-sm leading-relaxed text-slate-600">
                {state.message}
              </p>
              <div className="mt-6 flex flex-row-reverse flex-wrap gap-3">
                <button
                  ref={confirmRef}
                  type="button"
                  onClick={() => onResolve(true)}
                  className={cn(
                    'inline-flex min-w-[6.5rem] items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                    state.variant === 'danger'
                      ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500'
                      : 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500'
                  )}
                >
                  {state.confirmLabel ?? 'تأكيد'}
                </button>
                <button
                  type="button"
                  onClick={() => onResolve(false)}
                  className="inline-flex min-w-[6.5rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                >
                  {state.cancelLabel ?? 'إلغاء'}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [snackbars, setSnackbars] = useState<SnackbarItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>(defaultConfirmState);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const titleId = useId();
  const descId = useId();

  const dismissSnackbar = useCallback((id: string) => {
    setSnackbars((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const showSnackbar = useCallback(
    (message: string, variant: SnackbarVariant = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setSnackbars((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => dismissSnackbar(id), SNACKBAR_MS);
    },
    [dismissSnackbar]
  );

  const resolveConfirm = useCallback((value: boolean) => {
    setConfirmState((s) => ({ ...s, open: false }));
    resolverRef.current?.(value);
    resolverRef.current = null;
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setConfirmState({
      ...defaultConfirmState,
      ...options,
      open: true,
    });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const snackbarApi = useMemo(() => ({ showSnackbar }), [showSnackbar]);

  return (
    <SnackbarContext.Provider value={snackbarApi}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <SnackbarStack items={snackbars} onDismiss={dismissSnackbar} />
        <ConfirmDialogView
          state={confirmState}
          onResolve={resolveConfirm}
          titleId={titleId}
          descId={descId}
        />
      </ConfirmContext.Provider>
    </SnackbarContext.Provider>
  );
}
