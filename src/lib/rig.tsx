// "My Rig": the camper's vehicle, saved on the phone.
// Every screen reads it to color pins, check fit and price the cost meter.

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

import { STORAGE_KEYS } from '../config';
import type { Rig } from '../types';
import type { FitRig } from './fit';
import { DEFAULT_RIG, changeRig, normalizeRig } from './rigModel';
import { storedRigSchema } from './schemas';
import { usePersistentState } from './usePersistentState';

export { RIG_PRESETS } from './rigPresets';

interface RigContextValue {
  rig: Rig;
  /** False until the saved rig has been read (or found missing). */
  ready: boolean;
  setRig: (rig: Rig) => void;
  updateRig: (patch: Partial<Rig>) => void;
}

const RigContext = createContext<RigContextValue | null>(null);

export function RigProvider({ children }: { children: ReactNode }) {
  const [rig, update, ready] = usePersistentState(STORAGE_KEYS.rig, storedRigSchema, DEFAULT_RIG, normalizeRig);

  const setRig = useCallback((next: Rig) => update(next), [update]);
  const updateRig = useCallback((patch: Partial<Rig>) => update((prev) => changeRig(prev, patch)), [update]);

  const value = useMemo(() => ({ rig, ready, setRig, updateRig }), [rig, ready, setRig, updateRig]);
  return <RigContext.Provider value={value}>{children}</RigContext.Provider>;
}

export function useRig(): RigContextValue {
  const ctx = useContext(RigContext);
  if (!ctx) throw new Error('useRig must be used inside <RigProvider>');
  return ctx;
}

/**
 * Only the parts of the rig that change fit and cost. Stays the same object
 * while the camper types a new rig name, so lists and pins don't rebuild on
 * every keystroke.
 */
export function useFitRig(): FitRig {
  const { clearanceIn, drivetrain, setup, lengthFt } = useRig().rig;
  return useMemo(() => ({ clearanceIn, drivetrain, setup, lengthFt }), [clearanceIn, drivetrain, setup, lengthFt]);
}
