import { useI18n } from '../i18n';
import type { ApiError } from '../lib/api';

/** Friendly error with retry. Server messages are already user-safe; transport errors get our own copy. */
export function ErrorNotice({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const { t } = useI18n();
  const message =
    error.code === 'network'
      ? t('error.network')
      : error.code === 'timeout'
        ? t('error.timeout')
        : error.message || t('error.generic');
  return (
    <div role="alert" className="glass rounded-2xl p-5">
      <p className="text-sm text-ink">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full border border-line px-4 py-1.5 text-sm font-medium hover:bg-white/8"
        >
          {t('error.retry')}
        </button>
      )}
    </div>
  );
}
