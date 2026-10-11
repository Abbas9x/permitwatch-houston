import type {PermitFilters} from '../../../shared/permit';
import { DEFAULT_SEARCH_RADIUS_MILES } from '../../../shared/geo';
import type {
  ApiErrorBody,
  CommentDraftResponse,
  PermitDetailResponse,
  SearchResponse,
  SuggestResponse,
} from '../../../shared/api';
import type { CommentConcern, Language } from '../../../shared/validation';
import type { Coords } from './router';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.message === 'string'
  );
}

/** JSON request with a timeout. Throws ApiError with a user-safe message on any failure. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (options.signal?.aborted) throw new ApiError('aborted', '', 0);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? 20_000);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      credentials: 'same-origin',
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (isApiErrorBody(data)) {
        throw new ApiError(data.error.code, data.error.message, response.status, data.error.requestId);
      }
      throw new ApiError('http_error', '', response.status);
    }
    if (data === null) throw new ApiError('invalid_response', '', response.status);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.signal?.aborted) throw new ApiError('aborted', '', 0);
    throw new ApiError(timedOut ? 'timeout' : 'network', '', 0);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

export const api = {
  search: (q: string, coords: Coords | null, signal?: AbortSignal, radiusMiles = DEFAULT_SEARCH_RADIUS_MILES, filters: PermitFilters = {}) => {
    const params = new URLSearchParams({ q, radius: String(radiusMiles) });
    if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
      params.set('lat', String(coords.lat));
      params.set('lng', String(coords.lng));
    }
    if(filters.category) params.set('category',filters.category);
    if(filters.status) params.set('status',filters.status);
    return apiRequest<SearchResponse>(`/api/search?${params.toString()}`, { signal, timeoutMs: 25_000 });
  },
  suggest: (q: string, signal?: AbortSignal) =>
    apiRequest<SuggestResponse>(`/api/geocode/suggest?q=${encodeURIComponent(q)}`, { signal, timeoutMs: 6_000 }),
  permit: (id: string, signal?: AbortSignal) =>
    apiRequest<PermitDetailResponse>(`/api/permits/${encodeURIComponent(id)}`, { signal }),
  commentDraft: (
    id: string,
    body: { concerns: CommentConcern[]; personalNote: string; language: Language },
    signal?: AbortSignal,
  ) =>
    apiRequest<CommentDraftResponse>(`/api/permits/${encodeURIComponent(id)}/comment-draft`, {
      method: 'POST',
      body,
      signal,
      timeoutMs: 60_000,
    }),
};
