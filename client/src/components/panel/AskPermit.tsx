import { useId, useState, type FormEvent } from 'react';
import type { AskResponse } from '../../../../shared/api';
import type { Permit } from '../../../../shared/permit';
import { QUESTION_MAX } from '../../../../shared/validation';
import { useI18n } from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { ErrorNotice } from '../ErrorNotice';

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; error: ApiError } | { kind: 'done'; response: AskResponse };

export function AskPermit({ permit }: { permit: Permit }) {
  const { t, lang } = useI18n();
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [hint, setHint] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const q = question.trim();
    if (q.length < 3) {
      setHint(t('ask.tooShort'));
      return;
    }
    setHint(null);
    setStatus({ kind: 'loading' });
    try {
      setStatus({ kind: 'done', response: await api.ask(permit.id, { question: q, language: lang }) });
    } catch (error) {
      setStatus({ kind: 'error', error: error instanceof ApiError ? error : new ApiError('unknown', '', 0) });
    }
  };

  return (
    <section aria-labelledby={`ask-${permit.id}`} className="space-y-3">
      <h3 id={`ask-${permit.id}`} className="text-lg font-semibold text-ink">
        {t('ask.heading')}
      </h3>
      <form onSubmit={submit} noValidate className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t('ask.label')}
        </label>
        <input
          id={inputId}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={QUESTION_MAX}
          placeholder={t('ask.placeholder')}
          aria-describedby={hint ? hintId : undefined}
          aria-invalid={hint ? true : undefined}
          className="min-w-0 flex-1 rounded-xl border border-line bg-night/60 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-air-2/70 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status.kind === 'loading'}
          className="shrink-0 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-white/8 disabled:opacity-60"
        >
          {status.kind === 'loading' ? t('ask.asking') : t('ask.submit')}
        </button>
      </form>
      {hint && (
        <p id={hintId} role="alert" className="text-sm text-deadline">
          {hint}
        </p>
      )}
      <div aria-live="polite">
        {status.kind === 'error' && <ErrorNotice error={status.error} />}
        {status.kind === 'done' && (
          <div className="rounded-xl border border-line bg-white/[0.03] p-4">
            <p className="text-sm leading-relaxed text-ink">{status.response.answer}</p>
            <p className="mt-2 text-xs text-muted">
              {status.response.answerable ? t('ask.grounded') : t('ask.notAnswerable')}
            </p>
            {status.response.citedFields.length > 0 && (
              <p className="mt-1 text-xs text-faint">{t('ask.cited', { fields: status.response.citedFields.join(', ') })}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
