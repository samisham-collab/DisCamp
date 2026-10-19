// Phone notifications (push): "Cleanup approved", "Cleanup sent back",
// "Your cleanup got cleaned up" and, for moderators, "New cleanup to review".
// The cleanup-push Edge Function sends them through Expo's push service
// (setup in MODERATION.md); this file asks the camper, gets the phone's
// Expo push address and tells the DisCamp server about it.
//
// Push needs an app from the App Store or Google Play (or a development
// build): Expo Go can't receive DisCamp's notifications, and importing
// expo-notifications there only prints warnings. So it loads lazily, and
// everything here answers "unavailable" in Expo Go and on the web.

import type { SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { Platform } from 'react-native';

import { REMOTE_TIMEOUT_MS } from '../config';
import { withDeadline } from './deadline';
import { inExpoGo } from './expoGo';
import { describeError, log } from './log';
import { safeNext } from './navigation';

type Notifications = typeof NotificationsModule;

/** Android groups DisCamp's notifications under this channel in Settings. */
export const PUSH_CHANNEL = 'cleanups';

/**
 * Why push can't work here: 'expo-go' (use a store build or development
 * build), 'web', or 'no-project' (the build has no EAS project id: run
 * `npx eas-cli@latest init`).
 */
export type PushUnavailable = 'expo-go' | 'web' | 'no-project';

/** Whether the camper allowed notifications: 'undetermined' means the app may still ask. */
export type PushPermission = 'granted' | 'undetermined' | 'denied';

export type PushResult =
  | { status: 'on' }
  | { status: 'denied' }
  | { status: 'unavailable'; reason: PushUnavailable }
  | { status: 'error'; message: string };

/** The address this phone registered while this camper was signed in. */
let registered: string | null = null;
/** Goes up at each sign-out, so a registration still running then doesn't count. */
let generation = 0;

/** expo-notifications, or null where push can't work. */
export function notificationsModule(): Notifications | null {
  if (Platform.OS === 'web' || inExpoGo()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as Notifications;
  } catch (error) {
    log.info('Notifications are not in this build', { error: describeError(error) });
    return null;
  }
}

/** The EAS project id Expo's push service needs, or null before `eas init`. */
export function easProjectId(): string | null {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)?.eas?.projectId;
  const id = typeof fromConfig === 'string' ? fromConfig : Constants.easConfig?.projectId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

/** Null when push can work here; otherwise why not. */
export function pushUnavailable(): PushUnavailable | null {
  if (Platform.OS === 'web') return 'web';
  if (!notificationsModule()) return 'expo-go';
  if (!easProjectId()) return 'no-project';
  return null;
}

/** What the camper allowed, or null where push can't work. */
export async function pushPermission(): Promise<PushPermission | null> {
  const N = notificationsModule();
  if (!N || pushUnavailable()) return null;
  try {
    const p = await N.getPermissionsAsync();
    if (p.granted || p.ios?.status === N.IosAuthorizationStatus.PROVISIONAL) return 'granted';
    return p.canAskAgain ? 'undetermined' : 'denied';
  } catch (error) {
    log.info('Could not read the notification permission', { error: describeError(error) });
    return null;
  }
}

/**
 * Turns notifications on for the signed-in camper on this phone. With
 * `ask: false` it never shows the system prompt: it only refreshes the
 * address when the camper already said yes (each time the app opens).
 */
export async function turnOnPush(client: SupabaseClient, { ask }: { ask: boolean }): Promise<PushResult> {
  const unavailable = pushUnavailable();
  const N = notificationsModule();
  if (unavailable || !N) return { status: 'unavailable', reason: unavailable ?? 'expo-go' };
  const started = generation;
  try {
    let permission = await pushPermission();
    if (permission === 'undetermined' && ask) {
      const answer = await N.requestPermissionsAsync();
      permission = answer.granted || answer.ios?.status === N.IosAuthorizationStatus.PROVISIONAL ? 'granted' : 'denied';
    }
    if (permission !== 'granted') return { status: 'denied' };

    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync(PUSH_CHANNEL, {
        name: 'Cleanups',
        description: 'Reviews of cleanups you sent, and cleanups you posted getting cleaned up',
        importance: N.AndroidImportance.DEFAULT,
      });
    }
    const token = await thisPhonesAddress(N);
    const { error } = await withDeadline(
      async (signal) => client.rpc('register_push_token', { push_token: token, os: Platform.OS }).abortSignal(signal),
      REMOTE_TIMEOUT_MS,
    );
    if (error) throw new Error(error.message);
    // Signed out meanwhile: the next sign-out (or sign-in) sorts it out.
    if (started === generation) registered = token;
    return { status: 'on' };
  } catch (error) {
    const message = describeError(error);
    log.info('Could not turn on notifications', { error: message });
    return {
      status: 'error',
      message: "Couldn't turn on notifications. Check your signal and try again.",
    };
  }
}

/**
 * Signing out: this phone stops getting the camper's notifications. Best
 * effort: offline, the address stays until the next camper signs in here
 * (it moves to them) or the camper deletes their account.
 */
/** Signing out waits at most this long on each step (offline, it shouldn't hang). */
const SIGN_OUT_STEP_MS = 4_000;

export async function forgetThisPhone(client: SupabaseClient): Promise<void> {
  generation += 1;
  let token = registered;
  registered = null;
  try {
    // Not registered in this run of the app (the launch-time refresh failed
    // offline, say)? The server may still have it from before: ask the phone.
    if (!token) {
      const N = notificationsModule();
      if (!N || pushUnavailable() || (await pushPermission()) !== 'granted') return;
      token = await thisPhonesAddress(N, SIGN_OUT_STEP_MS);
    }
    const { error } = await withDeadline(
      async (signal) => client.rpc('forget_push_token', { push_token: token }).abortSignal(signal),
      SIGN_OUT_STEP_MS,
    );
    if (error) throw new Error(error.message);
  } catch (error) {
    log.info('Could not forget this phone for notifications', { error: describeError(error) });
  }
}

async function thisPhonesAddress(N: Notifications, timeoutMs = REMOTE_TIMEOUT_MS): Promise<string> {
  const { data } = await withDeadline(
    async () => N.getExpoPushTokenAsync({ projectId: easProjectId() ?? undefined }),
    timeoutMs,
  );
  return data;
}

/** After deleting the account: its addresses went with it on the server. */
export function clearPushRegistration(): void {
  registered = null;
}

/** Where a tapped notification goes: a known screen only, never an outside link. */
export function notificationPath(data: unknown): string | null {
  const url = data && typeof data === 'object' ? (data as { url?: unknown }).url : undefined;
  return safeNext(url);
}

/** For tests: forget the registered address. */
export function resetPushForTests(): void {
  registered = null;
}
