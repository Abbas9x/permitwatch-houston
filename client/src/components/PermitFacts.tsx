import type { ReactNode } from 'react';
import type { Permit } from '../../../shared/permit';
import { useI18n } from '../i18n';
import { formatDate, formatNumber } from '../lib/format';
import { ExternalLink } from './Link';

/** "Not listed in notice – check TCEQ", linking to the permit's own source. */
export function NotListed({ sourceUrl }: { sourceUrl: string }) {
  const { t } = useI18n();
  return (
    <ExternalLink href={sourceUrl} className="text-muted italic underline decoration-dotted underline-offset-4 hover:text-ink">
      {t('plant.notListed')}
    </ExternalLink>
  );
}

function Fact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-ink">{children}</dd>
    </div>
  );
}

/** Every permit field, straight from the dataset. Missing values are labeled, never filled in. */
export function PermitFacts({ permit }: { permit: Permit }) {
  const { t, lang } = useI18n();
  const missing = <NotListed sourceUrl={permit.sourceUrl} />;

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      <Fact label={t('plant.maxProduction')}>
        {permit.maxProductionCydPerHr !== null
          ? t('plant.maxProductionValue', { value: formatNumber(permit.maxProductionCydPerHr, lang, 2) })
          : missing}
      </Fact>
      <Fact label={t('plant.maxHours')}>
        {permit.maxHoursPerYear !== null
          ? t('plant.maxHoursValue', { value: formatNumber(permit.maxHoursPerYear, lang) })
          : missing}
      </Fact>
      <Fact label={t('plant.pollutants')} wide>
        {permit.pollutants.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {permit.pollutants.map((p) => (
              <li key={p} className="rounded-md border border-line bg-white/5 px-2 py-0.5 text-xs">
                {p}
              </li>
            ))}
          </ul>
        ) : (
          missing
        )}
      </Fact>
      <Fact label={t('plant.controls')} wide>
        {permit.controls ?? missing}
      </Fact>
      <Fact label={t('plant.noticeType')} wide>
        {permit.noticeType ?? missing}
      </Fact>
      <Fact label={t('plant.noticeDate')}>
        {permit.noticeIssuanceDate ? formatDate(permit.noticeIssuanceDate, lang) : missing}
      </Fact>
      <Fact label={t('plant.deadline')}>
        {permit.commentDeadline ? (
          <span className="font-semibold text-deadline">{formatDate(permit.commentDeadline, lang)}</span>
        ) : (
          missing
        )}
      </Fact>
      {permit.publicMeetingDate && (
        <Fact label={t('plant.meeting')}>{formatDate(permit.publicMeetingDate, lang)}</Fact>
      )}
      <Fact label={t('plant.address')} wide>
        {permit.address}, {permit.city}, {permit.county} County, TX {permit.zip}
      </Fact>
      <Fact label={t('plant.source')} wide>
        <ExternalLink href={permit.sourceUrl} className="text-air-2 underline underline-offset-4 hover:text-ink">
          {t('plant.sourceLink')}
        </ExternalLink>
      </Fact>
    </dl>
  );
}
