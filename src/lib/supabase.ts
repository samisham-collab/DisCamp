// Supabase client. Optional: without the two environment variables (see
// .env.example) the app runs on the bundled starter spots.
// The client is created on first use so a bad URL can't crash app start-up.

import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { log } from './log';

// Expo only inlines EXPO_PUBLIC_ variables when they are read like this,
// one by one with dot access.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && publishableKey);
}

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (!url || !publishableKey) {
    client = null;
    return client;
  }
  try {
    // v1.1 only reads public data, so there is no session to keep.
    client = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  } catch (error) {
    log.error('Supabase is misconfigured; using starter spots', error);
    client = null;
  }
  return client;
}
