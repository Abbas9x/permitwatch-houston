import type { Permit } from '../../../../shared/permit';
import { useI18n } from '../../i18n';
import { formatNumber } from '../../lib/format';
import { NotListed } from '../PermitFacts';

function Tile({ label, value, unit }: { label: string; value: string | null; unit: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white/[0.04] p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      {value !== null ? (
        <p className="mt-1 font-display text-3xl font-semibold text-ink">
          {value}
          <span className="ml-1.5 font-sans text-sm font-medium text-muted">{unit}</span>
        </p>
      ) : null}
    </div>
  );
}

/** The two headline permit numbers, straight from the dataset. */
export function KeyNumbers({ permit }: { permit: Permit }) {
  const { t, lang } = useI18n();
  const unitRate = lang === 'es' ? 'yd³/hora' : 'yd³/hour';
  const unitHours = lang === 'es' ? 'horas/año' : 'hours/year';
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Tile
          label={t('plant.maxProduction')}
          value={permit.maxProductionCydPerHr !== null ? formatNumber(permit.maxProductionCydPerHr, lang, 2) : null}
          unit={unitRate}
        />
        {permit.maxProductionCydPerHr === null && (
          <p className="mt-1.5 text-xs">
            <NotListed sourceUrl={permit.sourceUrl} />
          </p>
        )}
      </div>
      <div>
        <Tile
          label={t('plant.maxHours')}
          value={permit.maxHoursPerYear !== null ? formatNumber(permit.maxHoursPerYear, lang) : null}
          unit={unitHours}
        />
        {permit.maxHoursPerYear === null && (
          <p className="mt-1.5 text-xs">
            <NotListed sourceUrl={permit.sourceUrl} />
          </p>
        )}
      </div>
    </div>
  );
}
