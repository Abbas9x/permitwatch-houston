import { motion } from 'framer-motion';
import type { NearbyPlant } from '../../../shared/api';
import { useI18n } from '../i18n';
import { daysUntil, formatDate, formatMiles, formatNumber } from '../lib/format';
import { TYPE_COLORS } from '../lib/permitColors';
import { CategoryBadge, PermitTypeBadge, SampleBadge } from './Badges';

interface PlantListItemProps {
  plant: NearbyPlant;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function PlantListItem({ plant, index, selected, onSelect }: PlantListItemProps) {
  const { t, lang } = useI18n();
  const { permit } = plant;
  const direction = t(`dir.${plant.compass}`);
  const days = permit.commentDeadline ? daysUntil(permit.commentDeadline) : null;

  return (
    <motion.li
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.4), ease: [0.2, 0.7, 0.2, 1] }}
    >
      <button
        type="button"
        data-plant-button={permit.id}
        onClick={() => onSelect(permit.id)}
        aria-pressed={selected}
        aria-label={`${permit.company}, ${t('plant.distanceLong', { distance: formatMiles(plant.distanceMiles, lang), direction })}. ${t('plant.viewDetails')}`}
        className={`group relative w-full overflow-hidden rounded-2xl border p-4 text-left transition-colors ${
          selected ? 'border-air-2/70 bg-ink/10' : 'border-line bg-ink/[0.04] hover:border-ink/25 hover:bg-ink/[0.07]'
        }`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: TYPE_COLORS[permit.permitType] }}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <CategoryBadge category={permit.category} />
              <PermitTypeBadge type={permit.permitType} />
              {permit.isSample && <SampleBadge />}
            </div>
            <h3 className="truncate font-display text-base font-semibold text-ink">{permit.company}</h3>
            {permit.facilityName && <p className="truncate text-xs text-ink/80">{permit.facilityName}</p>}
            <p className="mt-0.5 text-xs text-muted">
              {t(permit.category === 'air_permit' ? 'plant.permitNumber' : 'plant.registration', { number: permit.registrationNumber })}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-display text-xl font-semibold text-ink tabular-nums">
              {formatMiles(plant.distanceMiles, lang)}
              <span className="ml-0.5 text-xs font-medium text-muted">mi</span>
            </p>
            <p className="text-xs font-medium text-muted uppercase">{direction}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>
            {permit.maxProductionCydPerHr !== null
              ? t('plant.maxProductionValue', { value: formatNumber(permit.maxProductionCydPerHr, lang) })
              : `${t('plant.maxProduction')}: ${t('plant.notListed')}`}
          </span>
          {permit.noticeIssuanceDate && (
            <span>
              {t('plant.noticeDate')}: {formatDate(permit.noticeIssuanceDate, lang)}
            </span>
          )}
          {permit.commentDeadline && days !== null && days >= 0 && (
            <span className="font-semibold text-deadline">
              {t('plant.deadline')}: {formatDate(permit.commentDeadline, lang)}
            </span>
          )}
        </div>
      </button>
    </motion.li>
  );
}
