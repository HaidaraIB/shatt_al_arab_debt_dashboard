import { createContext } from 'react';

export type SnackbarVariant = 'success' | 'error' | 'info';

export type SnackbarContextValue = {
  showSnackbar: (message: string, variant?: SnackbarVariant) => void;
};

export const SnackbarContext = createContext<SnackbarContextValue | null>(null);

export type ConfirmVariant = 'default' | 'danger';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
};

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);
