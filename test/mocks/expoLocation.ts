// Test stand-in for expo-location. Defaults: permission not asked yet, and
// granting it finds the camper in Goodland, Kansas.

import { jest } from '@jest/globals';

type Permission = { status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean; granted: boolean };
type Position = { coords: { latitude: number; longitude: number } };

export const GOODLAND = { latitude: 39.3508, longitude: -101.7101 };

export const Accuracy = { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 };

export const getForegroundPermissionsAsync = jest.fn<() => Promise<Permission>>(async () => ({
  status: 'undetermined',
  canAskAgain: true,
  granted: false,
}));

export const requestForegroundPermissionsAsync = jest.fn<() => Promise<Permission>>(async () => ({
  status: 'granted',
  canAskAgain: true,
  granted: true,
}));

export const hasServicesEnabledAsync = jest.fn<() => Promise<boolean>>(async () => true);

export const getLastKnownPositionAsync = jest.fn<() => Promise<Position | null>>(async () => null);

export const getCurrentPositionAsync = jest.fn<() => Promise<Position>>(async () => ({ coords: GOODLAND }));

// Following the camper (Drive mode): tests send fixes with emitFix, or a GPS
// error with emitWatchError.
type Fix = { latitude: number; longitude: number; accuracy?: number; heading?: number | null; speed?: number | null };
type Watcher = { callback: (fix: unknown) => void; onError?: (reason: string) => void; removed: boolean };
const watchers: Watcher[] = [];

export const watchPositionAsync = jest.fn(
  async (_options: unknown, callback: (fix: unknown) => void, onError?: (reason: string) => void) => {
    const watcher: Watcher = { callback, onError, removed: false };
    watchers.push(watcher);
    return {
      remove: () => {
        watcher.removed = true;
      },
    };
  },
);

/** Sends a GPS fix to every running watch. */
export function emitFix({ accuracy = 5, heading = 90, speed = 12, ...at }: Fix): void {
  for (const w of watchers) {
    if (!w.removed) w.callback({ coords: { ...at, accuracy, heading, speed, altitude: null }, timestamp: Date.now() });
  }
}

export function emitWatchError(reason: string): void {
  for (const w of watchers) if (!w.removed) w.onError?.(reason);
}

/** How many watches are running. */
export function activeWatches(): number {
  return watchers.filter((w) => !w.removed).length;
}

export function resetWatchers(): void {
  watchers.length = 0;
}
