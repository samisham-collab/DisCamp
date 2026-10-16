// Deleting an account that used Sign in with Apple: before the account goes,
// Apple's sheet confirms it's the camper and gives a one-time code, and the
// apple-revoke Edge Function uses it to disconnect DisCamp from their Apple
// ID (App Store rule 5.1.1(v)). Only the iPhone has that sheet; elsewhere,
// or when the function isn't set up, the app explains the manual steps.

import type { SupabaseClient } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { NETWORK_TIMEOUT_MS } from '../config';
import { canUseNativeApple } from './authFlows';
import { withDeadline } from './deadline';
import { describeError, log } from './log';

/**
 * revoked: DisCamp is disconnected from the camper's Apple ID.
 * cancelled: the camper closed Apple's sheet (ask before deleting anyway).
 * failed: something didn't work (or the function isn't set up): delete, then show the manual steps.
 * unavailable: no Apple sheet on this phone: the same.
 */
export type AppleRevokeResult = 'revoked' | 'cancelled' | 'failed' | 'unavailable';

export async function revokeAppleSignIn(client: SupabaseClient): Promise<AppleRevokeResult> {
  if (Platform.OS !== 'ios' || !(await canUseNativeApple())) return 'unavailable';

  let code: string | null;
  try {
    // No name or email this time: only proof it's them.
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    code = credential.authorizationCode;
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    log.warn('Apple check before deleting failed', { error: describeError(error) });
    return 'failed';
  }
  if (!code) return 'failed';

  try {
    const { data, error } = await withDeadline(
      async (signal) =>
        client.functions.invoke<{ revoked?: boolean; reason?: string }>('apple-revoke', {
          body: { code },
          signal,
        }),
      NETWORK_TIMEOUT_MS,
    );
    if (error) throw error;
    if (data?.revoked === true) return 'revoked';
    log.info('Apple was not disconnected', { reason: data?.reason ?? 'unknown' });
    return 'failed';
  } catch (error) {
    log.info('Could not reach apple-revoke', { error: describeError(error) });
    return 'failed';
  }
}
