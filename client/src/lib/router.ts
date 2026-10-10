import { useSyncExternalStore } from 'react';

/** Minimal history-API router: the app only has "/" (search, with ?q= and ?permit=) and "/dashboard". */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

const getSnapshot = () => window.location.pathname + window.location.search;

export function navigate(to: string, options: { replace?: boolean } = {}) {
  if (to === getSnapshot()) return;
  if (options.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  for (const listener of listeners) listener();
}

export interface Route {
  path: string;
  params: URLSearchParams;
}

export function useRoute(): Route {
  const href = useSyncExternalStore(subscribe, getSnapshot, () => '/');
  const url = new URL(href, 'http://local');
  return { path: url.pathname, params: url.searchParams };
}

export function searchHref(q: string, permitId?: string | null): string {
  const params = new URLSearchParams({ q });
  if (permitId) params.set('permit', permitId);
  return `/?${params.toString()}`;
}
