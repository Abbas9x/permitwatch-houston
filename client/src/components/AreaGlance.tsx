import type { AreaSummary } from '../../../shared/api';
import { useI18n } from '../i18n';
import { formatNumber } from '../lib/format';

/** Counts within 1/2/3 miles and combined permitted capacity, computed by the server from data only. */
export function AreaGlance({ area }: { area: AreaSummary }) {
  const { t, lang } = useI18n();
  const plural = (n: number) => (new Intl.PluralRules(lang).select(n) === 'one' ? 'one' : 'other');
  const tiles = [
    { radius: 1, count: area.within1, accent: 'var(--color-air-1)' },
    { radius: 2, count: area.within2, accent: 'var(--color-air-2)' },
    { radius: 3, count: area.within3, accent: 'var(--color-air-3)' },
  ];

  return (
    <section aria-labelledby="area-glance" className="space-y-3">
      <h2 id="area-glance" className="text-sm font-semibold tracking-wide text-muted uppercase">
        {t('area.heading')}
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <div key={tile.radius} className="rounded-2xl border border-line bg-white/[0.04] p-3">
            <p className="font-display text-3xl font-semibold text-ink">{tile.count}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs leading-tight text-muted">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: tile.accent }} />
              {t(`area.tile.${plural(tile.count)}`, { radius: tile.radius })}
            </p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-line bg-white/[0.04] p-4">
        <p className="text-xs font-medium text-muted">{t('area.capacity')}</p>
        {area.combinedCapacityCydPerHr !== null ? (
          <>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">
              {t('area.capacityValue', { value: formatNumber(area.combinedCapacityCydPerHr, lang, 2) })}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {t('area.capacityNote', { listed: area.capacityListedCount, total: area.within3 })}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">{t('area.capacityNone')}</p>
        )}
      </div>
    </section>
  );
}
