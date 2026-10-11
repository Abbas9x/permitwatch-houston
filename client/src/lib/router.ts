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

export interface Coords {
  lat: number;
  lng: number;
}

/** A picked place keeps its exact coordinates in the URL (shareable, no second lookup). */
export function searchHref(q: string, permitId?: string | null, coords?: Coords | null): string {
  const params = new URLSearchParams({ q });
  if (coords) {
    params.set('lat', coords.lat.toFixed(5));
    params.set('lng', coords.lng.toFixed(5));
  }
  if (permitId) params.set('permit', permitId);
  return `/?${params.toString()}`;
}

export function coordsFromParams(params: URLSearchParams): Coords | null {
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  const valid = params.has('lat') && params.has('lng') && Number.isFinite(lat) && Number.isFinite(lng);
  return valid && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
