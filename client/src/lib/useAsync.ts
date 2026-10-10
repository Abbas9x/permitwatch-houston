import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './api';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'success'; data: T };

/**
 * Runs `load` whenever `key` changes (or on retry), cancelling the previous request.
 * State is tagged with the key it belongs to, so a stale response can never show for a new key.
 */
export function useAsync<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const tag = key === null ? null : `${key}#${attempt}`;
  const [result, setResult] = useState<{ tag: string; state: AsyncState<T> } | null>(null);

  useEffect(() => {
    if (tag === null) return;
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => setResult({ tag, state: { status: 'success', data } }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const apiError = error instanceof ApiError ? error : new ApiError('unknown', '', 0);
        setResult({ tag, state: { status: 'error', error: apiError } });
      },
    );
    return () => controller.abort();
    // `load` is intentionally excluded: callers pass inline closures keyed by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: AsyncState<T> | null =
    tag === null ? null : result?.tag === tag ? result.state : { status: 'loading' };
  return { state, retry };
}
