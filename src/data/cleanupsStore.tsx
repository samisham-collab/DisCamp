// Cleanups, shared by every screen that shows them (the map, the Cleanups
// tab, spot pages). Loaded from the server when the app opens and again when
// the signed-in camper changes (their own hidden cleanups and blocks change
// what shows); screens refresh it when they come into view.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { STALE_AFTER_MS } from '../config';
import { useAuth } from '../lib/auth';
import { listCleanups, type CleanupTask } from './cleanups';

interface CleanupsContextValue {
  cleanups: CleanupTask[];
  /** True until the first answer (or when there's no server). */
  loading: boolean;
  /** What went wrong with the latest load, if it did. */
  error: string | null;
  refresh: () => Promise<void>;
  /** Shows a cleanup this phone just posted or changed, without a reload. */
  upsert: (task: CleanupTask) => void;
  remove: (id: string) => void;
}

const CleanupsContext = createContext<CleanupsContextValue | null>(null);

const EMPTY: CleanupTask[] = [];

export function CleanupsProvider({ children }: { children: ReactNode }) {
  const { client, user } = useAuth();
  const userId = user?.id ?? null;
  const [list, setCleanups] = useState<CleanupTask[]>(EMPTY);
  const [waiting, setLoading] = useState(true);
  const [failed, setError] = useState<string | null>(null);
  // Only the newest load's answer counts.
  const latest = useRef(0);
  // When the list last came from the server (0: never).
  const loadedAt = useRef(0);
  // Without a server there are no cleanups (and nothing to wait for).
  const cleanups = client ? list : EMPTY;
  const loading = client ? waiting : false;
  const error = client ? failed : null;

  /** Loads the list; only the newest load's answer counts. */
  const load = useCallback((): Promise<void> => {
    if (!client) return Promise.resolve();
    const ticket = latest.current + 1;
    latest.current = ticket;
    return listCleanups(client).then(
      (found) => {
        if (latest.current !== ticket) return;
        loadedAt.current = Date.now();
        setCleanups(found);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (latest.current !== ticket) return;
        setError(e instanceof Error ? e.message : "Couldn't load cleanups. Please try again.");
        setLoading(false);
      },
    );
  }, [client]);

  useEffect(() => {
    void load();
  }, [load, userId]);

  // Back to the app after a while: cleanups others posted or finished meanwhile.
  useEffect(() => {
    if (!client) return undefined;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && Date.now() - loadedAt.current > STALE_AFTER_MS) void load();
    });
    return () => subscription.remove();
  }, [client, load]);

  const upsert = useCallback((task: CleanupTask) => {
    // In place if it's listed (so lists don't jump around), else first.
    setCleanups((list) =>
      list.some((t) => t.id === task.id) ? list.map((t) => (t.id === task.id ? task : t)) : [task, ...list],
    );
  }, []);

  const remove = useCallback((id: string) => {
    setCleanups((list) => list.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(
    () => ({ cleanups, loading, error, refresh: load, upsert, remove }),
    [cleanups, loading, error, load, upsert, remove],
  );
  return <CleanupsContext.Provider value={value}>{children}</CleanupsContext.Provider>;
}

export function useCleanups(): CleanupsContextValue {
  const ctx = useContext(CleanupsContext);
  if (!ctx) throw new Error('useCleanups must be used inside <CleanupsProvider>');
  return ctx;
}
