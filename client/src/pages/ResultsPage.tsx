import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { SearchResponse } from '../../../shared/api';
import { ErrorNotice } from '../components/ErrorNotice';
import { PermitFacts } from '../components/PermitFacts';
import { PlantListItem } from '../components/PlantListItem';
import { SearchBar } from '../components/SearchBar';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { formatMiles } from '../lib/format';
import { navigate, searchHref } from '../lib/router';
import { useAsync } from '../lib/useAsync';

function ResultsSkeleton() {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t('results.loadingLabel')} className="space-y-3">
      <div className="skeleton h-7 w-2/3" />
      <div className="skeleton h-4 w-1/3" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-28 w-full rounded-2xl" />
      ))}
    </div>
  );
}

function SampleBanner() {
  const { t } = useI18n();
  return (
    <p className="rounded-xl border border-sample/40 bg-sample/10 px-4 py-3 text-sm text-sample">{t('sample.banner')}</p>
  );
}

function Results({ data, selectedId }: { data: SearchResponse; selectedId: string | null }) {
  const { t, tn, lang } = useI18n();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selected = data.plants.find((p) => p.permit.id === selectedId) ?? null;

  useEffect(() => {
    // Move focus to the results for screen readers without jumping the page.
    headingRef.current?.focus({ preventScroll: true });
  }, [data.query]);

  const select = (id: string) =>
    navigate(searchHref(data.query, id === selectedId ? null : id), { replace: true });

  return (
    <div className="space-y-5">
      <div>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold text-ink focus:outline-none sm:text-3xl">
          {t('results.heading', { place: data.location.label })}
        </h1>
        <p className="mt-1 text-sm text-muted">{tn('results.count', data.plants.length, { radius: data.radiusMiles })}</p>
        {data.location.approximate && data.location.zip && (
          <p className="mt-1 text-sm text-muted">{t('results.approximate', { zip: data.location.zip })}</p>
        )}
        {!data.geocoderAvailable && <p className="mt-1 text-sm text-sample">{t('results.geocoderDown')}</p>}
      </div>

      {data.hasSampleData && <SampleBanner />}

      {data.plants.length === 0 ? (
        <div className="glass rounded-2xl p-5 text-sm text-ink">
          <p>{t('results.none', { radius: data.radiusMiles })}</p>
          {data.nearestOutside && (
            <p className="mt-2 text-muted">
              {t('results.nearest', {
                company: data.nearestOutside.company,
                distance: formatMiles(data.nearestOutside.distanceMiles, lang),
                direction: t(`dir.${data.nearestOutside.compass}`),
              })}
            </p>
          )}
        </div>
      ) : (
        <ul aria-label={t('results.listLabel')} className="space-y-3">
          {data.plants.map((plant, index) => (
            <PlantListItem
              key={plant.permit.id}
              plant={plant}
              index={index}
              selected={plant.permit.id === selectedId}
              onSelect={select}
            />
          ))}
        </ul>
      )}

      <AnimatePresence>
        {selected && (
          <motion.section
            key={selected.permit.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            aria-label={selected.permit.company}
            className="glass rounded-2xl p-5"
          >
            <h2 className="mb-4 text-lg font-semibold">{selected.permit.company}</h2>
            <PermitFacts permit={selected.permit} />
          </motion.section>
        )}
      </AnimatePresence>

      <p className="text-xs text-muted">{t('disclaimer.permits')}</p>
    </div>
  );
}

export function ResultsPage({ q, selectedId }: { q: string; selectedId: string | null }) {
  const { state, retry } = useAsync(q, (signal) => api.search(q, signal));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <SearchBar key={q} initialValue={q} size="compact" />
      {state?.status === 'loading' && <ResultsSkeleton />}
      {state?.status === 'error' && <ErrorNotice error={state.error} onRetry={retry} />}
      {state?.status === 'success' && <Results data={state.data} selectedId={selectedId} />}
    </div>
  );
}
