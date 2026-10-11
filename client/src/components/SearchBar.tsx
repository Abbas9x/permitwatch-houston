import { DEFAULT_SEARCH_RADIUS_MILES } from '../../../shared/geo';
import { useEffect, useId, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { PlaceSuggestion } from '../../../shared/api';
import { checkSearchInput, SEARCH_QUERY_MAX } from '../../../shared/validation';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { addRecentSearch, getRecentSearches } from '../lib/recentSearches';
import { navigate, searchHref, type Coords } from '../lib/router';

const EXAMPLES = ['4014 Market St, Houston, TX 77020', '77026', '77494'];

interface SearchBarProps {
  initialValue?: string;
  size?: 'hero' | 'compact';
  radiusMiles?: number;
  autoFocus?: boolean;
  /** Runs before navigating (the landing page uses it to play its "dive" transition). */
  onBeforeNavigate?: (query: string) => Promise<void> | void;
}

interface Suggestion {
  value: string;
  kind: 'place' | 'recent' | 'example';
  coords?: Coords;
}

/**
 * Location search as an ARIA 1.2 combobox, like a maps app: matching places (addresses, cities,
 * ZIPs, landmarks) appear as you type, plus recent searches (stored only in this browser) and
 * examples. Arrow keys move, Enter picks, Escape closes.
 */
export function SearchBar({ initialValue = '', size = 'hero', autoFocus = false, onBeforeNavigate, radiusMiles = DEFAULT_SEARCH_RADIUS_MILES }: SearchBarProps) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>(getRecentSearches);
  const [places, setPlaces] = useState<{ query: string; items: PlaceSuggestion[] }>({ query: '', items: [] });
  const ids = { input: useId(), error: useId(), list: useId(), option: useId() };
  const hero = size === 'hero';

  // Live place suggestions: debounced, cancelled when the text changes, silent if the service is down.
  useEffect(() => {
    const query = value.replace(/\s+/g, ' ').trim();
    if (!open || query.length < 3 || checkSearchInput(query) !== null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.suggest(query, controller.signal).then(
        (res) => setPlaces({ query, items: res.suggestions }),
        () => setPlaces({ query, items: [] }),
      );
    }, 280);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, open]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    const needle = trimmed.toLowerCase();
    const matches = (s: string) => needle.length === 0 || s.toLowerCase().includes(needle);
    const placeMatches: Suggestion[] =
      places.query === trimmed ? places.items.map((p) => ({ value: p.label, kind: 'place', coords: { lat: p.lat, lng: p.lng } })) : [];
    const recentMatches = recent.filter(matches).map((v) => ({ value: v, kind: 'recent' as const }));
    const exampleMatches = EXAMPLES.filter((e) => matches(e) && !recent.includes(e)).map((v) => ({ value: v, kind: 'example' as const }));
    return [...placeMatches.slice(0, 5), ...recentMatches.slice(0, 3), ...exampleMatches].slice(0, 8);
  }, [value, recent, places]);

  const showList = open && suggestions.length > 0;

  const submit = async (query: string, coords?: Coords) => {
    const cleaned = query.replace(/\s+/g, ' ').trim();
    const problem = checkSearchInput(cleaned);
    if (problem) {
      setError(t(`search.error.${problem}`));
      return;
    }
    setError(null);
    setOpen(false);
    addRecentSearch(cleaned);
    setRecent(getRecentSearches());
    await onBeforeNavigate?.(cleaned);
    navigate(searchHref(cleaned, null, coords, radiusMiles));
    window.scrollTo({ top: 0 });
  };

  const choose = (suggestion: Suggestion) => {
    setValue(suggestion.value);
    void submit(suggestion.value, suggestion.coords);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const picked = showList && active >= 0 ? suggestions[active] : undefined;
    if (picked) choose(picked);
    else void submit(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (suggestions.length === 0 ? -1 : (i + 1) % suggestions.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (suggestions.length === 0 ? -1 : (i - 1 + suggestions.length) % suggestions.length));
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className="w-full">
      <form role="search" onSubmit={onSubmit} noValidate className="relative w-full">
        <label htmlFor={ids.input} className={hero ? 'mb-2 block text-sm font-medium text-muted' : 'sr-only'}>
          {t('search.label')}
        </label>
        <div
          className={`glass flex items-center gap-2 rounded-2xl p-1.5 transition-shadow focus-within:shadow-[0_0_0_2px_var(--color-air-2)] ${
            hero ? 'sm:p-2' : ''
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className={`ml-2.5 shrink-0 text-muted ${hero ? 'size-5' : 'size-4'}`}>
            <path
              fill="currentColor"
              d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"
            />
          </svg>
          <input
            id={ids.input}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={ids.list}
            aria-activedescendant={showList && active >= 0 ? `${ids.option}-${active}` : undefined}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
              setActive(-1);
              if (error) setError(null);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            placeholder={t('search.placeholder')}
            autoComplete="street-address"
            enterKeyHint="search"
            spellCheck={false}
            maxLength={SEARCH_QUERY_MAX}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- only on the dedicated search landing page
            autoFocus={autoFocus}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ids.error : undefined}
            className={`min-w-0 flex-1 bg-transparent text-ink placeholder:text-faint focus:outline-none ${
              hero ? 'py-3 text-base sm:text-lg' : 'py-2 text-sm sm:text-base'
            }`}
          />
          <button
            type="submit"
            className={`shrink-0 rounded-xl bg-gradient-to-r from-air-1 via-air-2 to-air-3 font-semibold text-night transition-transform hover:scale-[1.02] active:scale-[0.98] ${
              hero ? 'px-5 py-3 text-base' : 'px-4 py-2 text-sm'
            }`}
          >
            {t('search.submit')}
          </button>
        </div>
        <div
          id={ids.list}
          role="listbox"
          aria-label={t('search.label')}
          hidden={!showList}
          className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-line bg-night-2/95 py-1.5 shadow-2xl backdrop-blur-xl"
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={`${suggestion.kind}-${suggestion.value}`}
              id={`${ids.option}-${index}`}
              role="option"
              tabIndex={-1}
              aria-selected={index === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(suggestion)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') choose(suggestion);
              }}
              onMouseEnter={() => setActive(index)}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm ${
                index === active ? 'bg-ink/10 text-ink' : 'text-ink/90'
              }`}
            >
              <span aria-hidden="true" className="text-faint">
                {suggestion.kind === 'place' ? '⌖' : suggestion.kind === 'recent' ? '↺' : '→'}
              </span>
              <span className="truncate">{suggestion.value}</span>
              <span className="ml-auto shrink-0 text-xs text-faint">
                {suggestion.kind === 'place'
                  ? t('search.place')
                  : suggestion.kind === 'recent'
                    ? t('search.recent')
                    : t('search.example')}
              </span>
            </div>
          ))}
        </div>
      </form>
      <p id={ids.error} role="alert" className="mt-2 min-h-5 text-sm text-deadline">
        {error}
      </p>
      {hero && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>{t('search.try')}</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setValue(example);
                void submit(example);
              }}
              className="rounded-full border border-line bg-night/40 px-3 py-1 text-ink/90 backdrop-blur transition-colors hover:border-air-2/60 hover:bg-ink/6"
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
