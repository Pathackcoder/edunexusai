import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal data-fetching hook.
 *
 * The prototype had no data-fetching library, and adding one (React Query, SWR) would
 * have meant a dependency and a provider for the whole tree. This is the small amount of
 * behaviour the screens actually need: a request on mount, loading/error/empty state,
 * refetch, optimistic local updates, and cancellation so an unmounted screen never
 * writes state.
 *
 *   const { data, loading, error, refetch } = useApiQuery(() => academicApi.getCourses());
 *
 * `deps` works like a useEffect dependency list: change it and the request re-runs.
 */
export function useApiQuery(fetcher, deps = [], { enabled = true, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async ({ quiet = false } = {}) => {
      if (!enabled) {
        setLoading(false);
        return null;
      }
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const result = await fetcherRef.current();
        if (mounted.current) setData(result);
        return result;
      } catch (caught) {
        if (caught?.name === 'AbortError') return null;
        if (mounted.current) setError(caught);
        return null;
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, ...deps],
  );

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return {
    data,
    loading,
    error,
    /** Re-run the request, showing the loading state. */
    refetch: () => run(),
    /** Re-run without flashing the loading state, for background refreshes. */
    refresh: () => run({ quiet: true }),
    /** Apply a local change immediately; the server remains the source of truth. */
    setData,
    isEmpty: !loading && !error && (data === null || (Array.isArray(data) && data.length === 0)),
  };
}

/**
 * Companion hook for writes.
 *
 *   const { mutate, saving, error } = useApiMutation((payload) => profileApi.update(payload));
 */
export function useApiMutation(mutator, { onSuccess, onError } = {}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const mutatorRef = useRef(mutator);
  mutatorRef.current = mutator;

  const mutate = useCallback(
    async (...args) => {
      setSaving(true);
      setError(null);
      try {
        const result = await mutatorRef.current(...args);
        onSuccess?.(result);
        return { ok: true, data: result };
      } catch (caught) {
        setError(caught);
        onError?.(caught);
        return { ok: false, error: caught };
      } finally {
        setSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { mutate, saving, error, reset: () => setError(null) };
}
