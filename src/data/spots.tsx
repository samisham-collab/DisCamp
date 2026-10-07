// Loads spots once and shares them with every screen.
// Order: starter spots → saved offline copy → fresh copy from the server.
// The map is never empty: if the server fails, the last good copy stays up.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { REMOTE_TIMEOUT_MS } from '../config';
import { getSupabase } from '../lib/supabase';
import type { Spot } from '../types';
import { SEED_SPOTS } from './seedSpots';
import { SpotsLoadError, fetchRemoteSpots, loadCachedSpots, saveCachedSpots } from './spotsRepository';

export type SpotsSource = 'seed' | 'cache' | 'remote';

export interface SpotsState {
  spots: Spot[];
  source: SpotsSource;
  /** True until the first server request finishes. */
  loading: boolean;
  refreshing: boolean;
  /** Why the last server request failed, in plain words. */
  error: string | null;
  /** When the spots on screen came from the server (ISO time). */
  updatedAt: string | null;
  /** False when no server is configured: starter spots only. */
  remoteEnabled: boolean;
}

interface SpotsContextValue extends SpotsState {
  refresh: () => Promise<void>;
}

const SpotsContext = createContext<SpotsContextValue | null>(null);

interface Props {
  children: ReactNode;
  /** For tests. Defaults to the configured Supabase client, if any. */
  client?: SupabaseClient | null;
  seed?: Spot[];
  timeoutMs?: number;
}

export function SpotsProvider({
  children,
  client: clientProp,
  seed = SEED_SPOTS,
  timeoutMs = REMOTE_TIMEOUT_MS,
}: Props) {
  const [client] = useState(() => (clientProp !== undefined ? clientProp : getSupabase()));
  const [state, setState] = useState<SpotsState>(() => ({
    spots: seed,
    source: 'seed',
    loading: client != null,
    refreshing: false,
    error: null,
    updatedAt: null,
    remoteEnabled: client != null,
  }));
  const mounted = useRef(true);
  const inflight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback((): Promise<void> => {
    if (!client) return Promise.resolve();
    if (inflight.current) return inflight.current;
    const run = (async () => {
      setState((s) => ({ ...s, refreshing: true }));
      try {
        const { spots, skipped } = await fetchRemoteSpots(client, timeoutMs);
        if (!mounted.current) return;
        if (spots.length === 0) {
          const error = skipped > 0 ? "Spots from the server couldn't be read." : 'The server has no spots yet.';
          setState((s) => ({ ...s, loading: false, refreshing: false, error }));
          return;
        }
        const now = new Date();
        setState((s) => ({
          ...s,
          spots,
          source: 'remote',
          loading: false,
          refreshing: false,
          error: null,
          updatedAt: now.toISOString(),
        }));
        void saveCachedSpots(spots, now);
      } catch (error) {
        if (!mounted.current) return;
        const message = error instanceof SpotsLoadError ? error.message : "Couldn't load spots.";
        setState((s) => ({ ...s, loading: false, refreshing: false, error: message }));
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = run;
    return run;
  }, [client, timeoutMs]);

  useEffect(() => {
    if (!client) return undefined;
    let active = true;
    void (async () => {
      const cached = await loadCachedSpots();
      if (active && cached && cached.spots.length > 0) {
        setState((s) =>
          s.source === 'remote' ? s : { ...s, spots: cached.spots, source: 'cache', updatedAt: cached.savedAt },
        );
      }
      if (active) await refresh();
    })();
    return () => {
      active = false;
    };
  }, [client, refresh]);

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <SpotsContext.Provider value={value}>{children}</SpotsContext.Provider>;
}

export function useSpots(): SpotsContextValue {
  const ctx = useContext(SpotsContext);
  if (!ctx) throw new Error('useSpots must be used inside <SpotsProvider>');
  return ctx;
}

export function useSpot(id: string | undefined): { spot: Spot | undefined; loading: boolean } {
  const { spots, loading } = useSpots();
  return { spot: id ? spots.find((s) => s.id === id) : undefined, loading };
}
