import { useI18n } from '../i18n';
import { useRoute } from '../lib/router';
import { Link } from './Link';

export function Header() {
  const { t, lang, setLang } = useI18n();
  const { path } = useRoute();

  const navClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-white/12 text-ink' : 'text-muted hover:bg-white/8 hover:text-ink'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-night/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-lg" aria-label={t('app.name')}>
          <img src="/favicon.svg" alt="" width="28" height="28" className="size-7 shrink-0" />
          <span className="truncate font-display text-base font-semibold tracking-tight sm:text-lg">
            PermitWatch <span className="text-gradient hidden min-[400px]:inline">Houston</span>
          </span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          <Link
            href="/"
            className={`${navClass(path === '/')} hidden sm:inline-flex`}
            aria-current={path === '/' ? 'page' : undefined}
          >
            {t('nav.search')}
          </Link>
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'es' : 'en')}
            className="ml-1 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-white/8"
            aria-label={t('nav.languageLabel')}
            lang={lang === 'en' ? 'es' : 'en'}
          >
            {lang === 'en' ? 'ES' : 'EN'}
          </button>
        </nav>
      </div>
    </header>
  );
}
