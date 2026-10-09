// App-wide constants. Change values here rather than scattering them.

import type { Region } from './lib/geo';

/** Keys for data saved on the phone. Bump the version when the shape changes. */
export const STORAGE_KEYS = {
  rig: 'discamp.rig.v1',
  prefs: 'discamp.prefs.v1',
  spotsCache: 'discamp.spots-cache.v1',
  spotDraft: 'discamp.spot-draft.v1',
} as const;

/** Where the map opens before any spots load: Goodland, Kansas. */
export const DEFAULT_REGION: Region = {
  latitude: 39.27,
  longitude: -101.73,
  latitudeDelta: 0.32,
  longitudeDelta: 0.32,
};

/** Give up on the server after this long and keep showing saved spots. */
export const REMOTE_TIMEOUT_MS = 10_000;

/**
 * Supabase returns at most this many rows per request (its "Max rows" API
 * setting). DisCamp loads every spot in one request, which is fine for now;
 * before the map holds this many spots, switch to loading by map area.
 */
export const SERVER_ROW_LIMIT = 1_000;

/** Give up on reading saved settings after this long and use defaults. */
export const STORAGE_TIMEOUT_MS = 3_000;

/** Wait this long after the last change before saving settings. */
export const SAVE_DEBOUNCE_MS = 300;

/** Longest rig name shown in the app. */
export const MAX_RIG_NAME_LENGTH = 40;
