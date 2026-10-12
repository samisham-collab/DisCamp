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
 * Backstop for every request the Supabase client makes (sign-in token
 * renewal, signing out, deleting an account), which have no limit of their own.
 */
export const NETWORK_TIMEOUT_MS = 30_000;

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

/**
 * The terms of use campers agree to before adding spots. Must match
 * moderation.current_terms_version() in the database. When the terms change,
 * raise both (the database in a new migration) and update docs/terms.md.
 */
export const TERMS_VERSION = 1;

/** Youngest age allowed to make an account (also in docs/terms.md). */
export const MINIMUM_AGE = 13;

/** Reports and names: how many characters of details a camper can add. */
export const MAX_REPORT_DETAILS = 500;

/**
 * Where campers reach you. Set EXPO_PUBLIC_SUPPORT_EMAIL in .env (and on
 * expo.dev for builds). App Review needs a way to contact you in the app.
 */
export const SUPPORT_EMAIL: string | null = cleanEmail(process.env.EXPO_PUBLIC_SUPPORT_EMAIL);

/**
 * Where the privacy policy, terms and support page are published (the docs/
 * folder, on GitHub Pages by default). Set EXPO_PUBLIC_LEGAL_BASE_URL if you
 * host them somewhere else.
 */
export const LEGAL_BASE_URL: string = withSlash(
  process.env.EXPO_PUBLIC_LEGAL_BASE_URL?.trim() || 'https://samisham-collab.github.io/DisCamp/',
);

export const LEGAL_URLS = {
  privacy: `${LEGAL_BASE_URL}privacy/`,
  terms: `${LEGAL_BASE_URL}terms/`,
  support: `${LEGAL_BASE_URL}support/`,
} as const;

/** Apple's help page for removing an app from Sign in with Apple. */
export const APPLE_SIGN_IN_HELP_URL = 'https://support.apple.com/102571';

export function cleanEmail(value: string | undefined): string | null {
  const email = value?.trim() ?? '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}
