import { MotionConfig } from 'framer-motion';
import { lazy, Suspense } from 'react';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { useI18n } from './i18n';
import { coordsFromParams, filtersFromParams, radiusFromParams, useRoute } from './lib/router';
import { Landing } from './pages/Landing';

// Only the landing page ships in the first bundle; results (map, panel) load on demand.
const ResultsPage = lazy(() => import('./pages/ResultsPage').then((m) => ({ default: m.ResultsPage })));

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 py-6 sm:px-6" aria-hidden="true">
      <div className="skeleton h-12 w-full rounded-2xl" />
      <div className="skeleton h-7 w-2/3" />
      <div className="skeleton h-[40vh] w-full rounded-2xl" />
    </div>
  );
}

export function App() {
  const { t } = useI18n();
  const route = useRoute();
  const q = route.params.get('q');
  const permitId = route.params.get('permit');

  let page;
  if (route.path === '/' && q) page = <ResultsPage q={q} selectedId={permitId} coords={coordsFromParams(route.params)} radiusMiles={radiusFromParams(route.params)} filters={filtersFromParams(route.params)} />;
  else page = <Landing />;

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
          <Suspense fallback={<PageSkeleton />}>{page}</Suspense>
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
