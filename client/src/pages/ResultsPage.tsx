import { discardHeldEarth } from '../components/map/earthHandoff';
import {PERMIT_CATEGORIES, type PermitFilters} from '../../../shared/permit';
import {PermitFiltersControl} from '../components/PermitFiltersControl';
import {CATEGORY_SYMBOLS} from '../lib/permitCategories';
import { MAX_SEARCH_RADIUS_MILES } from '../../../shared/geo';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';
import type { SearchResponse } from '../../../shared/api';
import { AreaGlance } from '../components/AreaGlance';
import { ErrorNotice } from '../components/ErrorNotice';
import { PermitPanel } from '../components/panel/PermitPanel';
import { PlantListItem } from '../components/PlantListItem';
import { RadiusSlider } from '../components/RadiusSlider';
import { SearchBar } from '../components/SearchBar';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { formatMiles } from '../lib/format';
import { TYPE_COLORS } from '../lib/permitColors';
import { navigate, searchHref, type Coords } from '../lib/router';
import { resultsForRadius } from '../lib/searchResults';
import { useAsync } from '../lib/useAsync';
import { useMediaQuery } from '../lib/useMediaQuery';

const MapView = lazy(() => import('../components/map/MapView'));

function MapLegend() {
  const { t } = useI18n();
  const items = [
    { color: TYPE_COLORS.new, label: t('map.legendNew') },
    { color: TYPE_COLORS.renewal, label: t('map.legendRenewal') },
    { color: TYPE_COLORS.amendment, label: t('map.legendOther') },
  ];
  return (
    <ul className="pw-map-legend pointer-events-none absolute top-3 left-3 z-10 space-y-1 rounded-xl border border-line bg-night/80 px-3 py-2 text-xs text-ink backdrop-blur lg:top-auto lg:bottom-8">
      <li className="font-semibold">{t('map.categories')}</li>
      {PERMIT_CATEGORIES.map(category=><li key={category} className="flex items-center gap-2"><span aria-hidden="true" className="w-3 text-center">{CATEGORY_SYMBOLS[category]}</span>{t(`category.${category}`)}</li>)}
      <li aria-hidden="true" className="my-1 border-t border-line" />
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: item.color, boxShadow: `0 0 8px ${item.color}` }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function SampleBanner() {
  const { t } = useI18n();
  return <p className="rounded-xl border border-sample/40 bg-sample/10 px-4 py-3 text-sm text-sample">{t('sample.banner')}</p>;
}

function Results({ data, selectedId, coords, onReady, filters }: { onReady: () => void; data: SearchResponse; selectedId: string | null; coords: Coords | null; filters: PermitFilters }) {
  const { t, tn, lang } = useI18n();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const reducedMotion = useReducedMotion() ?? false;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const unit = t(data.radiusMiles === 1 ? 'radius.unit.one' : 'radius.unit.other');
  const selected = data.plants.find((p) => p.permit.id === selectedId) ?? null;

  useEffect(() => {
    // Reveal the destination as soon as its content mounts, not when map tiles finish loading.
    onReady();
  }, [onReady]);

  useEffect(() => {
    // Announce new results to screen readers without jumping the page.
    headingRef.current?.focus({ preventScroll: true });
  }, [data.query]);

  const mapPlants = useMemo(
    () =>
      data.plants.map((p) => ({
        id: p.permit.id,
        lat: p.permit.lat,
        lng: p.permit.lng,
        color: TYPE_COLORS[p.permit.permitType],
        category: p.permit.category,
        label: t('map.markerLabel', {
          company: `${p.permit.facilityName??p.permit.company} (${t(`category.${p.permit.category}`)})`,
          type: t(`type.${p.permit.permitType}`),
          distance: formatMiles(p.distanceMiles, lang),
          direction: t(`dir.${p.compass}`),
        }),
      })),
    [data, t, lang],
  );

  const select = (id: string) => navigate(searchHref(data.query, id, coords, data.radiusMiles, filters), { replace: true });
  const close = () => {
    const id = selectedId;
    const focusedAtClose = document.activeElement;
    navigate(searchHref(data.query, null, coords, data.radiusMiles, filters), { replace: true });
    if (id) {
      requestAnimationFrame(() => {
        // Restore keyboard context only if the resident has not already focused another control.
        if(document.activeElement===focusedAtClose || document.activeElement===document.body)
          document.querySelector<HTMLElement>(`[data-plant-button="${CSS.escape(id)}"]`)?.focus();
      });
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] [grid-template-areas:'head'_'map'_'body'] lg:h-[calc(100dvh-3.5rem)] lg:grid-cols-[minmax(360px,440px)_1fr] lg:grid-rows-[auto_1fr] lg:[grid-template-areas:'head_map'_'body_map']">
      <div className="space-y-3 border-line px-4 pt-5 pb-4 [grid-area:head] sm:px-6 lg:border-r lg:border-b">
        <SearchBar key={data.query} initialValue={data.query} size="compact" radiusMiles={data.radiusMiles} filters={filters} />
        <RadiusSlider value={data.radiusMiles} onChange={radius => navigate(searchHref(data.query, null, coords, radius, filters), {replace:true})} />
        <PermitFiltersControl value={filters} onChange={next=>navigate(searchHref(data.query,null,coords,data.radiusMiles,next),{replace:true})} />
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl leading-tight font-semibold text-ink focus:outline-none sm:text-2xl">
            {t('results.heading', { place: data.location.label })}
          </h1>
          <p aria-live="polite" className="mt-1 text-sm text-muted">{tn('results.count', data.plants.length, { radius: data.radiusMiles, unit })}</p>
          {data.location.source === 'place_search' && data.location.approximate && (
            <p className="mt-1 text-xs text-muted">{t('results.placeArea', { place: data.location.label })}</p>
          )}
          {data.location.source === 'zip_centroid' && data.location.zip && (
            <p className="mt-1 text-xs text-muted">{t('results.approximate', { zip: data.location.zip })}</p>
          )}
          {!data.geocoderAvailable && <p className="mt-1 text-xs text-sample">{t('results.geocoderDown')}</p>}
        </div>
      </div>

      <div className="relative h-[46vh] min-h-[300px] overflow-hidden [grid-area:map] lg:h-full">
        <Suspense fallback={null}>
          <MapView
            center={data.location}
            radiusMiles={data.radiusMiles}
            plants={mapPlants}
            selectedId={selectedId}
            onSelect={select}
            reducedMotion={reducedMotion}
            ariaLabel={t('map.label', { place: data.location.label, radius: data.radiusMiles, unit })}
            youLabel={t('map.you')}
            unavailableText={t('map.unavailable')}
            loadingText={t('map.loading')}
            slowText={t('map.slow')}
            panelPadding={isDesktop ? { right: 500, bottom: 40 } : { right: 40, bottom: 40 }}
          />
        </Suspense>
        <MapLegend />
        <AnimatePresence>
          {selected && isDesktop && <PermitPanel key={selected.permit.id} plant={selected} onClose={close} variant="side" />}
        </AnimatePresence>
      </div>

      <div className="space-y-5 px-4 py-5 [grid-area:body] sm:px-6 lg:overflow-y-auto lg:border-r lg:border-line">
        <AreaGlance area={data.area} radiusMiles={data.radiusMiles} />
        {data.hasSampleData && <SampleBanner />}
        {data.plants.length === 0 ? (
          <div className="glass rounded-2xl p-5 text-sm text-ink">
            <p>{t('results.none', { radius: data.radiusMiles, unit })}</p>
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
        <p className="text-xs text-muted">{t('disclaimer.permits')}</p>
        <p className="text-xs text-muted">{t('data.coverage')}</p>
      </div>

      <AnimatePresence>
        {selected && !isDesktop && <PermitPanel key={selected.permit.id} plant={selected} onClose={close} variant="sheet" />}
      </AnimatePresence>
    </div>
  );
}

export function ResultsPage({ q, selectedId, coords, radiusMiles, onReady, filters = {} }: { onReady: () => void; q: string; selectedId: string | null; coords: Coords | null; radiusMiles: number; filters?: PermitFilters }) {
  const key = `${coords ? `${q}@${coords.lat},${coords.lng}` : q}|${filters.category??"all"}|${filters.status??"all"}`;
  const { state, retry } = useAsync(key, (signal) => api.search(q, coords, signal, MAX_SEARCH_RADIUS_MILES, filters));

  useEffect(() => {
    if (state?.status === 'error') {
      discardHeldEarth();
      onReady();
    }
  }, [state?.status, onReady]);

  const data = useMemo(() => state?.status === 'success' ? resultsForRadius(state.data, radiusMiles) : null, [state, radiusMiles]);
  if (data) return <Results onReady={onReady} data={data} selectedId={selectedId} coords={coords} filters={filters} />;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      {state?.status === 'error' ? (
        <>
          <SearchBar key={q} initialValue={q} size="compact" radiusMiles={radiusMiles} filters={filters} />
          <ErrorNotice error={state.error} onRetry={retry} />
        </>
      ) : (
        null
      )}
    </div>
  );
}
