import { MotionConfig } from 'framer-motion';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { useI18n } from './i18n';
import { useRoute } from './lib/router';
import { Landing } from './pages/Landing';
import { ResultsPage } from './pages/ResultsPage';

export function App() {
  const { t } = useI18n();
  const route = useRoute();
  const q = route.params.get('q');
  const permitId = route.params.get('permit');

  let page;
  if (route.path === '/' && q) page = <ResultsPage q={q} selectedId={permitId} />;
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
          {page}
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
