import { useCallback, useEffect, useState } from 'react';
import { sisApi } from '../services/api/sisApi';
import { useAuth } from '../context/AuthContext';

/**
 * The signed-in user's own CampusCore record (GET /sis/me/profile), shared by the header,
 * profile pages and dashboards so the SIS is asked once per minute, not once per widget.
 *
 * Result: { state: 'OK' | 'UNMAPPED' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'ERROR', ... }.
 * Academic values are shown only when state is OK; there is no local fallback.
 */
const TTL_MS = 60_000;
// Keyed by portal user id, so a record can never be shown to a different signed-in user.
const cache = new Map(); // userId -> { at, promise }

function load(userId, force = false) {
  const hit = cache.get(userId);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = sisApi.myProfile().catch((error) => ({
    state: error?.status === 403 ? 'FORBIDDEN' : 'ERROR',
    message: error?.message ?? 'CampusCore SIS could not be reached.',
  }));
  cache.set(userId, { at: Date.now(), promise });
  return promise;
}

/** Forget cached records (sign-in, sign-out). */
export function clearSisProfile() {
  cache.clear();
}

export function useSisProfile({ enabled = true } = {}) {
  const { user } = useAuth();
  const userId = enabled ? user?.id ?? null : null;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(userId));

  const run = useCallback(async (force) => {
    if (!userId) return null;
    setLoading(true);
    const result = await load(userId, force);
    setData(result);
    setLoading(false);
    return result;
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setData(null);
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    load(userId).then((result) => {
      if (!active) return;
      setData(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  // A faculty member who is also a student has both records (recordType MULTIPLE).
  const student = data?.state === 'OK' ? data.student ?? null : null;
  const faculty = data?.state === 'OK' ? data.faculty ?? null : null;
  return { data, loading, student, faculty, academic: data?.academic ?? null, refetch: () => run(true) };
}

/** Short label for a non-OK state, for compact places such as the header. */
export function sisStateLabel(data, loading) {
  if (loading) return 'Loading…';
  switch (data?.state) {
    case 'UNMAPPED': return 'Not linked to SIS';
    case 'NOT_CONFIGURED': return 'SIS not connected';
    case 'FORBIDDEN': return 'Not permitted';
    case 'OK': return null;
    default: return 'SIS unavailable';
  }
}
