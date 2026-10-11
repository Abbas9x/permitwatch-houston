import {PERMIT_CATEGORIES} from '../../../shared/permit';
import {CATEGORY_SYMBOLS} from '../lib/permitCategories';
import type { AreaSummary } from '../../../shared/api';
import { useI18n } from '../i18n';
import { formatNumber } from '../lib/format';

/** Counts and listed capacity for the selected search distance. */
export function AreaGlance({ area, radiusMiles }: { area: AreaSummary; radiusMiles: number }) {
  const { t, lang } = useI18n();
  const plural = (n: number) => (new Intl.PluralRules(lang).select(n) === 'one' ? 'one' : 'other');
  const unit = t(radiusMiles === 1 ? 'radius.unit.one' : 'radius.unit.other');

  return (
    <section aria-labelledby="area-glance" className="space-y-3">
      <h2 id="area-glance" className="text-sm font-semibold tracking-wide text-muted uppercase">
        {t('area.heading')}
      </h2>
      <div className="flex items-center gap-4 rounded-2xl border border-line bg-ink/[0.04] p-4">
        <p className="font-display text-4xl font-semibold text-air-2">{area.withinRadius}</p>
        <p className="text-sm text-muted">{t(`area.tile.${plural(area.withinRadius)}`, {radius:radiusMiles, unit})}</p>
      </div>
      {area.categoryCounts && <ul aria-label={t('area.categories')} className="space-y-2 rounded-2xl border border-line bg-ink/[0.04] p-4 text-sm">
        {PERMIT_CATEGORIES.map(category=><li key={category} className="flex justify-between gap-3"><span><span aria-hidden="true" className="mr-2">{CATEGORY_SYMBOLS[category]}</span>{t(`category.${category}`)}</span><span className="font-semibold text-ink tabular-nums">{area.categoryCounts?.[category]??0}</span></li>)}
      </ul>}
      {(area.categoryCounts?.concrete_batch_plant??area.withinRadius)>0 && <div className="rounded-2xl border border-line bg-ink/[0.04] p-4">
        <p className="text-xs font-medium text-muted">{t('area.capacity', {radius:radiusMiles, unit})}</p>
        {area.combinedCapacityCydPerHr !== null ? (
          <>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">
              {t('area.capacityValue', { value: formatNumber(area.combinedCapacityCydPerHr, lang, 2) })}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {t('area.capacityNote', { listed: area.capacityListedCount, total: area.categoryCounts?.concrete_batch_plant??area.withinRadius })}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">{t('area.capacityNone')}</p>
        )}
      </div>}
    </section>
  );
}
