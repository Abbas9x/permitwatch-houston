import { AnimatePresence, motion } from 'framer-motion';
import { useId, useRef, useState, type FormEvent } from 'react';
import type { CommentDraftResponse } from '../../../../shared/api';
import type { Permit } from '../../../../shared/permit';
import { COMMENT_CONCERNS, PERSONAL_NOTE_MAX, type CommentConcern } from '../../../../shared/validation';
import { useI18n } from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { ErrorNotice } from '../ErrorNotice';

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; error: ApiError } | { kind: 'done'; response: CommentDraftResponse };

export function CommentDrafter({ permit }: { permit: Permit }) {
  const { t, lang } = useI18n();
  const [concerns, setConcerns] = useState<Set<CommentConcern>>(new Set());
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const ids = { note: useId(), subject: useId(), body: useId(), validation: useId(), status: useId() };

  const toggle = (concern: CommentConcern) =>
    setConcerns((prev) => {
      const next = new Set(prev);
      if (next.has(concern)) next.delete(concern);
      else next.add(concern);
      return next;
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (concerns.size === 0 && note.trim().length === 0) {
      setValidation(t('draft.needOne'));
      return;
    }
    setValidation(null);
    setStatus({ kind: 'loading' });
    setCopyState('idle');
    try {
      const response = await api.commentDraft(permit.id, {
        concerns: COMMENT_CONCERNS.filter((c) => concerns.has(c)),
        personalNote: note.trim(),
        language: lang,
      });
      setSubject(response.draft.subject);
      setBody(response.draft.body);
      setStatus({ kind: 'done', response });
    } catch (error) {
      setStatus({ kind: 'error', error: error instanceof ApiError ? error : new ApiError('unknown', '', 0) });
    }
  };

  const copy = async () => {
    const text = `${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      bodyRef.current?.select();
      setCopyState('failed');
    }
  };


  return (
    <div className="space-y-4 border-t border-line pt-4">
      <div>
        <h4 className="text-base font-semibold text-ink">{t('draft.heading')}</h4>
        <p className="mt-1 text-sm leading-relaxed text-muted">{t('draft.intro')}</p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-4">
        <fieldset aria-describedby={validation ? ids.validation : undefined}>
          <legend className="mb-2 text-sm font-medium text-ink">{t('draft.concernsLegend')}</legend>
          <div className="flex flex-wrap gap-2">
            {COMMENT_CONCERNS.map((concern) => {
              const checked = concerns.has(concern);
              return (
                <label
                  key={concern}
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-air-2 ${
                    checked ? 'border-air-2/70 bg-air-2/15 text-ink' : 'border-line text-muted hover:text-ink'
                  }`}
                >
                  <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(concern)} />
                  <span aria-hidden="true" className="mr-1">
                    {checked ? '✓' : '+'}
                  </span>
                  {t(`draft.concern.${concern}`)}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor={ids.note} className="mb-1.5 block text-sm font-medium text-ink">
            {t('draft.note')}
          </label>
          <textarea
            id={ids.note}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, PERSONAL_NOTE_MAX))}
            maxLength={PERSONAL_NOTE_MAX}
            rows={3}
            placeholder={t('draft.notePlaceholder')}
            className="w-full resize-y rounded-xl border border-line bg-night/60 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-air-2/70 focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-faint">
            {t('draft.charCount', { count: note.length, max: PERSONAL_NOTE_MAX })}
          </p>
        </div>

        <p id={ids.validation} role="alert" className="min-h-0 text-sm text-deadline empty:hidden">
          {validation}
        </p>

        <button
          type="submit"
          disabled={status.kind === 'loading'}
          className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-night transition-opacity disabled:opacity-60"
        >
          {status.kind === 'loading' ? t('draft.drafting') : t('draft.submit')}
        </button>
      </form>

      <div id={ids.status} aria-live="polite">
        {status.kind === 'loading' && (
          <div className="space-y-2" aria-hidden="true">
            <div className="skeleton h-9 w-full" />
            <div className="skeleton h-40 w-full" />
          </div>
        )}
        {status.kind === 'error' && <ErrorNotice error={status.error} />}
        <AnimatePresence>
          {status.kind === 'done' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <p className="text-sm font-medium text-ink">{t('draft.resultLabel')}</p>
              <div>
                <label htmlFor={ids.subject} className="mb-1 block text-xs font-medium text-muted">
                  {t('draft.subject')}
                </label>
                <input
                  id={ids.subject}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-xl border border-line bg-night/60 px-3 py-2 text-sm text-ink focus:border-air-2/70 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor={ids.body} className="mb-1 block text-xs font-medium text-muted">
                  {t('draft.body')}
                </label>
                <textarea
                  id={ids.body}
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="w-full resize-y rounded-xl border border-line bg-night/60 px-3 py-2 text-sm leading-relaxed text-ink focus:border-air-2/70 focus:outline-none"
                />
              </div>
              <p className="text-xs leading-relaxed text-muted">{t('draft.byTemplate')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={copy}
                  className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-ink/8"
                >
                  {t('draft.copy')}
                </button>
                <span role="status" className="text-sm text-air-1">
                  {copyState === 'copied' ? t('draft.copied') : copyState === 'failed' ? t('draft.copyFailed') : ''}
                </span>
              </div>
              <p className="text-xs font-medium text-ink">{t('draft.never')}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
