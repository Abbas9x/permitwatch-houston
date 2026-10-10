import { useId, useState, type FormEvent } from 'react';
import { checkSearchInput, SEARCH_QUERY_MAX } from '../../../shared/validation';
import { useI18n } from '../i18n';
import { navigate, searchHref } from '../lib/router';

const EXAMPLES = ['4014 Market St, Houston, TX 77020', '77026', '77494'];

interface SearchBarProps {
  initialValue?: string;
  size?: 'hero' | 'compact';
  autoFocus?: boolean;
}

export function SearchBar({ initialValue = '', size = 'hero', autoFocus = false }: SearchBarProps) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const hero = size === 'hero';

  const submit = (query: string) => {
    const problem = checkSearchInput(query);
    if (problem) {
      setError(t(`search.error.${problem}`));
      return;
    }
    setError(null);
    navigate(searchHref(query.replace(/\s+/g, ' ').trim()));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(value);
  };

  return (
    <div className="w-full">
      <form role="search" onSubmit={onSubmit} noValidate className="w-full">
        <label htmlFor={inputId} className={hero ? 'mb-2 block text-sm font-medium text-muted' : 'sr-only'}>
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
            id={inputId}
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder={t('search.placeholder')}
            autoComplete="street-address"
            enterKeyHint="search"
            spellCheck={false}
            maxLength={SEARCH_QUERY_MAX}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- only on the dedicated search landing page
            autoFocus={autoFocus}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
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
      </form>
      <p id={errorId} role="alert" className="mt-2 min-h-5 text-sm text-deadline">
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
                submit(example);
              }}
              className="rounded-full border border-line px-3 py-1 text-ink/90 transition-colors hover:border-air-2/60 hover:bg-white/6"
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
