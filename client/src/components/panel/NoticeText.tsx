import { useState } from 'react';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { ErrorNotice } from '../ErrorNotice';

/** The raw notice text, loaded only when the reader expands it. Rendered as plain text, never HTML. */
export function NoticeText({ permitId }: { permitId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { state, retry } = useAsync(open ? permitId : null, (signal) => api.permit(permitId, signal));

  return (
    <details className="group rounded-xl border border-line" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer list-none rounded-xl px-4 py-3 text-sm font-medium text-ink hover:bg-ink/5">
        <span aria-hidden="true" className="mr-2 inline-block transition-transform group-open:rotate-90">
          ›
        </span>
        {t('panel.noticeText')}
      </summary>
      <div className="px-4 pb-4">
        {state?.status === 'loading' && <p className="text-sm text-muted">{t('panel.noticeTextLoading')}</p>}
        {state?.status === 'error' && <ErrorNotice error={state.error} onRetry={retry} />}
        {state?.status === 'success' && (
          <p className="max-h-72 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-muted">
            {state.data.rawText || t('plant.notListed')}
          </p>
        )}
      </div>
    </details>
  );
}
