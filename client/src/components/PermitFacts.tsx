import type { ReactNode } from 'react';
import type { Permit } from '../../../shared/permit';
import { useI18n } from '../i18n';
import { formatDate, formatNumber } from '../lib/format';
import { ExternalLink } from './Link';

/** Missing source values always link to the official record for confirmation. */
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
  const airOrConcrete = permit.category === 'air_permit' || permit.category === 'concrete_batch_plant';
  const operator = permit.operatorName === undefined && airOrConcrete ? permit.company : permit.operatorName;

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      <Fact label={t('plant.category')}>{t(`category.${permit.category}`)}</Fact>
      <Fact label={t('plant.status')}>
        {t(`status.${permit.permitStatus ?? 'unknown'}`)}
        {permit.sourceStatus && permit.permitStatus && permit.permitStatus !== 'unknown' && <span className="ml-1 text-muted">({permit.sourceStatus})</span>}
      </Fact>
      <Fact label={t('plant.operator')}>{operator ?? missing}</Fact>
      {permit.permitteeName && <Fact label={t('plant.permittee')}>{permit.permitteeName}</Fact>}
      {(airOrConcrete || permit.permitType !== 'unknown') && <Fact label={t('plant.type')}>{t(`type.${permit.permitType}`)}</Fact>}
      {/* Production rate and operating hours are concrete-plant permit fields. */}
      {permit.category === 'concrete_batch_plant' && (
        <>
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
        </>
      )}
      {(airOrConcrete || permit.pollutants.length > 0) && <Fact label={t(permit.category === 'air_permit' ? 'plant.airContaminants' : 'plant.pollutants')} wide>
        {permit.pollutants.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {permit.pollutants.map((p) => (
              <li key={p} className="rounded-md border border-line bg-ink/5 px-2 py-0.5 text-xs">
                {p}
              </li>
            ))}
          </ul>
        ) : (
          missing
        )}
      </Fact>}
      {(airOrConcrete || permit.controls) && <Fact label={t('plant.controls')} wide>
        {permit.controls ?? missing}
      </Fact>}
      {(airOrConcrete || permit.noticeType) && <Fact label={t('plant.noticeType')} wide>
        {permit.noticeType ?? missing}
      </Fact>}
      {(airOrConcrete || permit.noticeIssuanceDate) && <Fact label={t('plant.noticeDate')}>
        {permit.noticeIssuanceDate ? formatDate(permit.noticeIssuanceDate, lang) : missing}
      </Fact>}
      {permit.applicationDate && <Fact label={t('plant.applicationDate')}>{formatDate(permit.applicationDate, lang)}</Fact>}
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
        {permit.address}, {permit.city}, {permit.county} County, TX{permit.zip ? ` ${permit.zip}` : ''}
      </Fact>
      {permit.locationNotes && <Fact label={t('plant.locationNotes')} wide>{permit.locationNotes}</Fact>}
      {permit.dataSource && <Fact label={t('plant.dataSource')} wide>{permit.dataSource}</Fact>}
      {permit.retrievedAt && <Fact label={t('plant.retrievedAt')}>{formatDate(permit.retrievedAt.slice(0, 10), lang)}</Fact>}
      <Fact label={t('plant.source')} wide>
        <ExternalLink href={permit.sourceUrl} className="text-air-2 underline underline-offset-4 hover:text-ink">
          {t('plant.sourceLink')}
        </ExternalLink>
      </Fact>
      {permit.noticeUrl && permit.noticeUrl !== permit.sourceUrl && <Fact label={t('act.viewNotice')} wide>
        <ExternalLink href={permit.noticeUrl} className="text-air-2 underline underline-offset-4 hover:text-ink">
          {t('act.viewNotice')}
        </ExternalLink>
      </Fact>}
    </dl>
  );
}
