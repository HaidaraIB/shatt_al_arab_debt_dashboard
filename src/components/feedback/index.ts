/**
 * Public entry for feedback UI. App shell code imports from `./components/feedback` relative to `src`.
 * Modules under `feedback/` import each other with relative paths (not through this barrel) to avoid circular re-exports.
 */
export { FeedbackProvider } from './feedback-provider';
export { useConfirm, useSnackbar } from './use-feedback';
export type { ConfirmOptions, SnackbarVariant } from './feedback-context';
export {
  ButtonLoadingContent,
  FullscreenLoading,
  LoadingFeedback,
  LoadingOverlay,
  LoadingSpinner,
  type LoadingSpinnerSize,
} from './loading-feedback';
