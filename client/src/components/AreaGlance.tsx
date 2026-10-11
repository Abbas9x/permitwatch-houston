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
      <div className="rounded-2xl border border-line bg-ink/[0.04] p-4">
        <p className="text-xs font-medium text-muted">{t('area.capacity', {radius:radiusMiles, unit})}</p>
        {area.combinedCapacityCydPerHr !== null ? (
          <>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">
              {t('area.capacityValue', { value: formatNumber(area.combinedCapacityCydPerHr, lang, 2) })}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {t('area.capacityNote', { listed: area.capacityListedCount, total: area.withinRadius })}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">{t('area.capacityNone')}</p>
        )}
      </div>
    </section>
  );
}
