// Supabase client. Optional: without the two environment variables (see
// .env.example) the app runs on the bundled starter spots, and sign-in and
// adding spots are switched off.
// The client is created on first use so a bad URL can't crash app start-up.

import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { NETWORK_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from '../config';
import { fetchWithTimeout } from './deadline';
import { log } from './log';
import { secureSessionStorage } from './secureStorage';

// Expo only inlines EXPO_PUBLIC_ variables when they are read like this,
// one by one with dot access.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && publishableKey);
}

/** How long one request to the server may take: photo uploads get longer. */
export function timeLimitFor(url: string): number {
  return url.includes('/storage/v1/') ? UPLOAD_TIMEOUT_MS : NETWORK_TIMEOUT_MS;
}

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (!url || !publishableKey) {
    client = null;
    return client;
  }
  try {
    client = createClient(url, publishableKey, {
      auth: {
        // The session is kept in the phone's keychain. AuthProvider (auth.tsx)
        // pauses token refresh while the app is in the background.
        storage: secureSessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        // Sign-in uses PKCE: the browser hands back a one-time code, never
        // the tokens themselves, and only this app can trade the code in.
        flowType: 'pkce',
        detectSessionInUrl: false,
      },
      // A stalled connection never answers on Android, so nothing would ever
      // give up. Requests with their own, shorter limit keep it; photo
      // uploads get longer.
      global: {
        fetch: fetchWithTimeout(timeLimitFor),
      },
    });
  } catch (error) {
    log.error('Supabase is misconfigured; using starter spots', error);
    client = null;
  }
  return client;
}
