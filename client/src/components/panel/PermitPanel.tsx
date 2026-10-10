import { motion } from 'framer-motion';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { NearbyPlant } from '../../../../shared/api';
import { useI18n } from '../../i18n';
import { formatMiles } from '../../lib/format';
import { PermitTypeBadge, SampleBadge } from '../Badges';
import { PermitFacts } from '../PermitFacts';
import { ActNow } from './ActNow';
import { AskPermit } from './AskPermit';
import { KeyNumbers } from './KeyNumbers';
import { NoticeText } from './NoticeText';
import { SummaryBlock } from './SummaryBlock';

interface PermitPanelProps {
  plant: NearbyPlant;
  onClose: () => void;
  /** "side": glass panel over the map (desktop). "sheet": full-screen modal sheet (phones). */
  variant: 'side' | 'sheet';
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, textarea, select, summary, [tabindex]:not([tabindex="-1"])';

export function PermitPanel({ plant, onClose, variant }: PermitPanelProps) {
  const { t, lang } = useI18n();
  const { permit } = plant;
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = `panel-title-${permit.id}`;

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    panelRef.current?.scrollTo({ top: 0 });
  }, [permit.id]);

  useEffect(() => {
    if (variant !== 'sheet') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [variant]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    // Keep keyboard focus inside the modal sheet.
    if (variant === 'sheet' && event.key === 'Tab' && panelRef.current) {
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const frame =
    variant === 'side'
      ? 'glass absolute inset-y-3 right-3 z-20 w-[min(460px,calc(100%-1.5rem))] rounded-2xl'
      : 'fixed inset-x-0 top-14 bottom-0 z-50 bg-night';

  return (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-modal={variant === 'sheet'}
      aria-labelledby={headingId}
      onKeyDown={onKeyDown}
      initial={variant === 'side' ? { opacity: 0, x: 40 } : { opacity: 0, y: 60 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={variant === 'side' ? { opacity: 0, x: 40 } : { opacity: 0, y: 60 }}
      transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
      className={`${frame} overflow-y-auto overscroll-contain`}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-night/85 px-5 py-4 backdrop-blur-xl">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <PermitTypeBadge type={permit.permitType} />
            {permit.isSample && <SampleBadge />}
          </div>
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-lg leading-tight font-semibold text-ink focus:outline-none">
            {permit.company}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {t('plant.registration', { number: permit.registrationNumber })} ·{' '}
            {t('plant.distanceLong', { distance: formatMiles(plant.distanceMiles, lang), direction: t(`dir.${plant.compass}`) })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('panel.close')}
          className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-ink hover:bg-white/10"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
            <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="space-y-6 px-5 py-5">
        <SummaryBlock summary={plant.summary} />
        <KeyNumbers permit={permit} />
        <ActNow permit={permit} />
        <section aria-labelledby={`facts-${permit.id}`}>
          <h3 id={`facts-${permit.id}`} className="mb-3 text-lg font-semibold text-ink">
            {t('panel.allFacts')}
          </h3>
          <PermitFacts permit={permit} />
        </section>
        <NoticeText permitId={permit.id} />
        <AskPermit permit={permit} />
        <p className="border-t border-line pt-4 text-xs text-muted">{t('disclaimer.permits')}</p>
      </div>
    </motion.div>
  );
}
