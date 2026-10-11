import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'framer-motion';
import { lazy, Suspense, useCallback, useState } from 'react';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { useI18n } from './i18n';
import { coordsFromParams, radiusFromParams, useRoute } from './lib/router';
import { Landing } from './pages/Landing';

// Only the landing page ships in the first bundle; results (map, panel) load on demand.
const ResultsPage = lazy(() => import('./pages/ResultsPage').then((m) => ({ default: m.ResultsPage })));

export function App() {
  const { t } = useI18n();
  const route = useRoute();
  const q = route.params.get('q');
  const permitId = route.params.get('permit');

  const reducedMotion = useReducedMotion();
  const [diving, setDiving] = useState(false);
  const [readySearch, setReadySearch] = useState<string | null>(null);
  const searchKey = q ? `${q}@${route.params.get('lat') ?? ''},${route.params.get('lng') ?? ''}` : null;
  const onReady = useCallback(() => {
    setReadySearch(searchKey);
    setDiving(false);
  }, [searchKey]);
  const transitioning = searchKey ? readySearch !== searchKey : diving;

  let page;
  if (route.path === '/' && q) page = <ResultsPage onReady={onReady} q={q} selectedId={permitId} coords={coordsFromParams(route.params)} radiusMiles={radiusFromParams(route.params)} />;
  else page = <Landing onDive={() => setDiving(true)} />;

  return (
    <MotionConfig reducedMotion="user">
      <a
        href="#main"
        className="sr-only-focusable fixed top-2 left-2 z-50 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-night"
      >
        {t('nav.skip')}
      </a>
      <div className="flex min-h-dvh flex-col">
        <Header />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          <Suspense fallback={null}>{page}</Suspense>
        </main>
        <Footer />
      </div>
      <AnimatePresence>
        {transitioning && (
          <motion.div
            key="map-transition"
            data-testid="map-transition"
            className="fixed inset-0 z-[100] bg-night/10"
            initial={{ opacity: searchKey ? 1 : 0, backdropFilter: searchKey ? 'blur(16px)' : 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(16px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)', transition: { duration: 0 } }}
            transition={{ duration: reducedMotion ? 0 : 0.55, ease: [0.4, 0, 0.2, 1] }}
            role="status"
            aria-label={t('results.loadingLabel')}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
