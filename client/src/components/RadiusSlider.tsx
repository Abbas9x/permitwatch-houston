import { useId } from 'react';
import { MAX_SEARCH_RADIUS_MILES, MIN_SEARCH_RADIUS_MILES } from '../../../shared/geo';
import { useI18n } from '../i18n';

export function RadiusSlider({value,onChange}: {value:number;onChange:(value:number)=>void}) {
  const id = useId();
  const {t} = useI18n();
  const unit = t(value === 1 ? 'radius.unit.one' : 'radius.unit.other');
  return (
    <div className="rounded-2xl border border-air-2/25 bg-air-2/5 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">{t('radius.label')}</label>
        <output htmlFor={id} className="font-display text-sm font-semibold text-air-2">{value} {unit}</output>
      </div>
      <input
        id={id}
        type="range"
        min={MIN_SEARCH_RADIUS_MILES}
        max={MAX_SEARCH_RADIUS_MILES}
        step={1}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        aria-valuetext={`${value} ${unit}`}
        aria-describedby={`${id}-hint`}
        className="mt-1 h-8 w-full cursor-pointer accent-air-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-air-2"
      />
      <div aria-hidden="true" className="flex justify-between text-xs text-muted"><span>1 mi</span><span>10 mi</span></div>
      <p id={`${id}-hint`} className="mt-2 text-xs text-muted">{t('radius.hint')}</p>
    </div>
  );
}
