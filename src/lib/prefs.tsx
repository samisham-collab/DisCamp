// Small preferences remembered between launches: filters, map or list view,
// and standard or satellite map.

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

import { STORAGE_KEYS } from '../config';
import { prefsSchema, type Prefs, type SpotFilter } from './schemas';
import { usePersistentState } from './usePersistentState';

export const DEFAULT_PREFS: Prefs = { filters: [], mapType: 'standard', view: 'map' };

function normalizePrefs(prefs: Prefs): Prefs {
  return { ...prefs, filters: [...new Set(prefs.filters)] };
}

interface PrefsContextValue {
  prefs: Prefs;
  ready: boolean;
  toggleFilter: (filter: SpotFilter) => void;
  clearFilters: () => void;
  setView: (view: Prefs['view']) => void;
  setMapType: (mapType: Prefs['mapType']) => void;
}

const PrefsContext = createContext<PrefsContextValue | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, update, ready] = usePersistentState(STORAGE_KEYS.prefs, prefsSchema, DEFAULT_PREFS, normalizePrefs);

  const toggleFilter = useCallback(
    (filter: SpotFilter) =>
      update((p) => ({
        ...p,
        filters: p.filters.includes(filter) ? p.filters.filter((f) => f !== filter) : [...p.filters, filter],
      })),
    [update],
  );
  const clearFilters = useCallback(() => update((p) => ({ ...p, filters: [] })), [update]);
  const setView = useCallback((view: Prefs['view']) => update((p) => ({ ...p, view })), [update]);
  const setMapType = useCallback((mapType: Prefs['mapType']) => update((p) => ({ ...p, mapType })), [update]);

  const value = useMemo(
    () => ({ prefs, ready, toggleFilter, clearFilters, setView, setMapType }),
    [prefs, ready, toggleFilter, clearFilters, setView, setMapType],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsContextValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used inside <PrefsProvider>');
  return ctx;
}
