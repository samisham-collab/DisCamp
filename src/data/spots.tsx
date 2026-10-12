// Loads spots once and shares them with every screen.
// Order: starter spots → saved offline copy → fresh copy from the server.
// The map is never empty: if the server fails, the last good copy stays up.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { REMOTE_TIMEOUT_MS } from '../config';
import { useServerClient } from '../lib/server';
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
  /**
   * Loads again even if a load is already on its way, for after a change the
   * server makes (unblocking a camper): an answer from before it is dropped.
   */
  reload: () => Promise<void>;
  /** Shows a spot the camper just added or edited right away, without a reload. */
  saveLocal: (spot: Spot) => void;
  /** Takes a spot the camper just deleted off the map right away. */
  removeLocal: (id: string) => void;
  /** Takes every spot a camper added off the map right away (after blocking them). */
  removeByCreator: (camperId: string) => void;
}

/** Spots in name order, like the server sends them, with `spot` added or replaced. */
function withSpot(spots: Spot[], spot: Spot): Spot[] {
  return [...spots.filter((s) => s.id !== spot.id), spot].sort((a, b) => a.name.localeCompare(b.name));
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
  const client = useServerClient(clientProp);
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
  // Set when a local change should also go into the offline copy.
  const saveAfterChange = useRef(false);
  // Goes up with every local change (a spot added, deleted or blocked, or a
  // different camper signing in). A server answer to a request sent before
  // the change is out of date: it's dropped and the spots load again.
  const generation = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback((): Promise<void> => {
    if (!client) return Promise.resolve();
    if (inflight.current) return inflight.current;
    const started = generation.current;
    let outdated = false;
    const run = (async () => {
      setState((s) => ({ ...s, refreshing: true }));
      try {
        const { spots, skipped } = await fetchRemoteSpots(client, timeoutMs);
        if (!mounted.current) return;
        if (generation.current !== started) {
          outdated = true;
          return;
        }
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
        if (generation.current !== started) {
          outdated = true;
          return;
        }
        const message = error instanceof SpotsLoadError ? error.message : "Couldn't load spots.";
        setState((s) => ({ ...s, loading: false, refreshing: false, error: message }));
      } finally {
        inflight.current = null;
      }
    })();
    const done = run.then(() => (outdated && mounted.current ? refreshRef.current() : undefined));
    inflight.current = done;
    return done;
  }, [client, timeoutMs]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Who sees which spots depends on who's signed in (your own spots hidden
  // for review, campers you've blocked), so load again when that changes.
  useEffect(() => {
    if (!client) return undefined;
    let seen: string | null | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user.id ?? null;
      const changed = seen !== undefined && uid !== seen;
      seen = uid;
      if (changed) {
        generation.current += 1;
        // Spots hidden for review are only ever shown to the camper who added
        // them: take them off right away, even if the reload fails offline.
        setState((s) => {
          if (!s.spots.some((spot) => spot.hidden)) return s;
          saveAfterChange.current = true;
          return { ...s, spots: s.spots.filter((spot) => !spot.hidden) };
        });
        // Supabase asks not to call it from inside this listener.
        timer = setTimeout(() => void refresh(), 0);
      }
    });
    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [client, refresh]);

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

  const saveLocal = useCallback((spot: Spot) => {
    generation.current += 1;
    saveAfterChange.current = true;
    setState((s) => ({ ...s, spots: withSpot(s.spots, spot) }));
  }, []);

  const removeLocal = useCallback((id: string) => {
    generation.current += 1;
    saveAfterChange.current = true;
    setState((s) => ({ ...s, spots: s.spots.filter((spot) => spot.id !== id) }));
  }, []);

  const removeByCreator = useCallback((camperId: string) => {
    generation.current += 1;
    saveAfterChange.current = true;
    setState((s) => ({ ...s, spots: s.spots.filter((spot) => spot.createdBy !== camperId) }));
  }, []);

  const reload = useCallback(() => {
    generation.current += 1;
    return refresh();
  }, [refresh]);

  // A local change goes into the offline copy too, keeping the time the spots
  // last came from the server: the copy is no fresher than that.
  useEffect(() => {
    if (!saveAfterChange.current) return;
    saveAfterChange.current = false;
    void saveCachedSpots(state.spots, state.updatedAt ? new Date(state.updatedAt) : undefined);
  }, [state.spots, state.updatedAt]);

  const value = useMemo(
    () => ({ ...state, refresh, reload, saveLocal, removeLocal, removeByCreator }),
    [state, refresh, reload, saveLocal, removeLocal, removeByCreator],
  );
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
