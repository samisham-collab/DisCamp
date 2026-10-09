// Links that open the app pass through here before Expo Router sees them.
// The sign-in redirect (…/auth/callback?code=…) is not a screen: the sign-in
// sheet already has it, so the app stays where it is. If the link starts the
// app from scratch (the phone closed DisCamp during sign-in), it finishes
// signing in and lands on Account.

import { completeSignInFromUrl, isAuthCallback } from '@/lib/authFlows';
import { log } from '@/lib/log';
import { getSupabase } from '@/lib/supabase';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    if (!isAuthCallback(path)) return path;
    const client = getSupabase();
    if (client) void completeSignInFromUrl(client, path);
    return initial ? '/account' : null;
  } catch (error) {
    log.error('Could not handle an incoming link', error);
    return initial ? '/' : null;
  }
}
