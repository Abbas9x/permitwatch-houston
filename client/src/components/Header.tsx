import { useI18n } from '../i18n';
import { useTheme } from '../lib/theme';
import { Link } from './Link';

export function Header() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-night/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-lg" aria-label={t('app.name')}>
          <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-air-2 text-air-2">◎</span>
          <span className="truncate font-display text-base font-semibold tracking-tight sm:text-lg">
            PermitWatch <span className="text-gradient hidden min-[400px]:inline">Houston</span>
          </span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={t(theme === 'dark' ? 'nav.lightMode' : 'nav.darkMode')}
            title={t(theme === 'dark' ? 'nav.lightMode' : 'nav.darkMode')}
            className="grid size-9 place-items-center rounded-full border border-line text-ink hover:bg-ink/8"
          >
            <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
          </button>
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'es' : 'en')}
            className="ml-1 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-ink/8"
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
