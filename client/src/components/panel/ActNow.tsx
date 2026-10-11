import { TCEQ_LINKS, type Permit } from '../../../../shared/permit';
import { shouldCheckOfficialRecord } from '../../../../shared/commentPolicy';
import { useI18n } from '../../i18n';
import { daysUntil, formatDate } from '../../lib/format';
import { ExternalLink } from '../Link';
import { CommentDrafter } from './CommentDrafter';

/** Deadline status. Only ever counts down to a deadline that is in the dataset; never computes one. */
function DeadlineStatus({ permit }: { permit: Permit }) {
  const { t, lang } = useI18n();
  if (!permit.commentDeadline) {
    return (
      <p className="text-sm leading-relaxed text-ink">
        {permit.noticeIssuanceDate
          ? t('act.noDeadline', { date: formatDate(permit.noticeIssuanceDate, lang) })
          : t('act.noDeadlineNoDate')}
      </p>
    );
  }
  const days = daysUntil(permit.commentDeadline);
  const date = formatDate(permit.commentDeadline, lang);
  if (days === null || days < 0) {
    return <p className="text-sm text-ink">{t('act.passed', { date })}</p>;
  }
  const plural = new Intl.PluralRules(lang).select(days) === 'one' ? 'one' : 'other';
  return (
    <div className="flex items-center gap-4">
      <div
        className="flex size-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-deadline/50 bg-deadline/10"
        aria-hidden="true"
      >
        <span className="font-display text-2xl leading-none font-semibold text-deadline">{days}</span>
      </div>
      <div>
        <p className="text-base font-semibold text-ink">
          {days === 0 ? t('act.today') : t(`act.daysLeft.${plural}`, { count: days })}
        </p>
        <p className="text-sm text-muted">{t('act.deadlineFrom', { date })}</p>
      </div>
    </div>
  );
}

export function ActNow({ permit }: { permit: Permit }) {
  const { t, lang } = useI18n();
  const recordOnly = shouldCheckOfficialRecord(permit);
  const deadlineDays = permit.commentDeadline ? daysUntil(permit.commentDeadline) : null;
  return (
    <section aria-labelledby={`act-${permit.id}`} className="space-y-4 rounded-2xl border border-deadline/25 bg-deadline/[0.04] p-4">
      <h3 id={`act-${permit.id}`} className="text-lg font-semibold text-ink">
        {t(recordOnly ? 'act.checkRecord' : 'act.heading')}
      </h3>
      {recordOnly ? <>
        <p className="text-sm leading-relaxed text-ink">{t('act.noKnownPeriod')}</p>
        {deadlineDays !== null && deadlineDays < 0 && <DeadlineStatus permit={permit} />}
      </> : <DeadlineStatus permit={permit} />}
      {permit.publicMeetingDate && (
        <p className="text-sm text-ink">{t('act.meeting', { date: formatDate(permit.publicMeetingDate, lang) })}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <ExternalLink href={TCEQ_LINKS.complaints} className="inline-flex items-center rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:bg-ink/8">{t('act.reportConcern')}</ExternalLink>
        {!recordOnly && <ExternalLink
          href={TCEQ_LINKS.eComment}
          className="inline-flex items-center rounded-xl bg-gradient-to-r from-air-1 via-air-2 to-air-3 px-4 py-2.5 text-sm font-semibold text-night"
        >
          {t('act.ecomment')}
        </ExternalLink>}
        <ExternalLink
          href={recordOnly ? permit.sourceUrl : permit.noticeUrl ?? permit.sourceUrl}
          className="inline-flex items-center rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-ink/8"
        >
          {t(recordOnly ? 'act.viewRecord' : 'act.viewNotice')}
        </ExternalLink>
      </div>
      {!recordOnly && <>
        <p className="text-xs leading-relaxed text-muted">{t('act.publicRecord')}</p>
      </>}
      <CommentDrafter permit={permit} concernsOnly={recordOnly} />
    </section>
  );
}
