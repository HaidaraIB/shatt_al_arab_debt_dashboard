import { useContext } from 'react';
import { ConfirmContext, SnackbarContext } from './feedback-context';

export function useSnackbar() {
  const ctx = useContext(SnackbarContext);
  if (!ctx) throw new Error('useSnackbar must be used within FeedbackProvider');
  return ctx;
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within FeedbackProvider');
  return ctx;
}
