// The sign-in steps themselves, kept out of React so each path can be tested.
//
// Google, Microsoft and GitHub (and Apple on Android) open the provider's page
// in a secure browser sheet. Supabase uses PKCE: the sheet hands back a
// one-time code in a link to discamp://auth/callback, and only this app,
// which holds the matching secret, can trade it for a session.
// On iPhone, Apple uses the built-in "Sign in with Apple" sheet instead.

import type { AuthError, SupabaseClient } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { providerLabel, type AuthProviderId } from './authProviders';
import { checkDisplayName, DEFAULT_DISPLAY_NAME } from './displayName';
import { describeError, log } from './log';

export type SignInResult = { status: 'signed-in' } | { status: 'cancelled' } | { status: 'error'; message: string };

export const AUTH_CALLBACK_PATH = 'auth/callback';

/**
 * Where the provider sends the camper back: discamp://auth/callback in the
 * app, an exp:// link in Expo Go. Both must be listed in Supabase (README).
 */
export function authRedirectUrl(): string {
  try {
    return Linking.createURL(AUTH_CALLBACK_PATH);
  } catch (error) {
    // Only happens without app.json (some test setups); builds always have it.
    log.warn('Could not build the sign-in link; using the app scheme', { error: describeError(error) });
    return `discamp://${AUTH_CALLBACK_PATH}`;
  }
}

/** True for the sign-in redirect, as a full link or an Expo Router path. */
export function isAuthCallback(url: string): boolean {
  return /(^|\/)auth\/callback(?=$|[?#])/.test(url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '/'));
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/** The code (or error) the provider put in the redirect's query or fragment. */
export function parseAuthCallback(url: string): { code: string | null; error: string | null } {
  const params = new Map<string, string>();
  const tail = url.slice(Math.max(0, url.search(/[?#]/)));
  for (const pair of tail.split(/[?#&]/)) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decode(eq === -1 ? pair : pair.slice(0, eq));
    if (!params.has(key)) params.set(key, decode(eq === -1 ? '' : pair.slice(eq + 1)));
  }
  const code = params.get('code')?.trim() || null;
  const error = params.get('error_description')?.trim() || params.get('error')?.trim() || null;
  return { code, error };
}

function isNetworkMessage(message: string): boolean {
  return /network request failed|failed to fetch|network error|load failed|timed out/i.test(message);
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return describeError(error);
}

/** A message a camper can act on, from whatever Supabase or the provider said. */
export function friendlyAuthError(error: Pick<AuthError, 'message'> | unknown, provider?: AuthProviderId): string {
  const message = messageOf(error);
  if (isNetworkMessage(message))
    return "You're offline or the server can't be reached. Try again when you have signal.";
  if (/provider is not enabled|unsupported provider/i.test(message)) {
    return `Sign-in with ${providerLabel(provider)} isn't set up on the DisCamp server yet.`;
  }
  if (/code verifier|flow state|invalid.*grant|expired/i.test(message)) {
    return 'That sign-in link expired. Please try again.';
  }
  return "Sign-in didn't work. Please try again.";
}

// Each code can be traded once. The browser sheet and a deep link can both
// deliver the same redirect, so the second caller gets the first one's answer.
const exchanges = new Map<string, Promise<SignInResult>>();

export function exchangeCode(client: SupabaseClient, code: string): Promise<SignInResult> {
  const existing = exchanges.get(code);
  if (existing) return existing;
  const run = client.auth
    .exchangeCodeForSession(code)
    .then(({ error }): SignInResult => {
      if (!error) return { status: 'signed-in' };
      log.warn('Could not finish sign-in', { message: error.message });
      return { status: 'error', message: friendlyAuthError(error) };
    })
    .catch((error: unknown): SignInResult => {
      log.warn('Could not finish sign-in', { error: describeError(error) });
      return { status: 'error', message: friendlyAuthError(error) };
    });
  exchanges.set(code, run);
  return run;
}

/** Finishes sign-in from the redirect link. */
export function completeSignInFromUrl(client: SupabaseClient, url: string): Promise<SignInResult> {
  const { code, error } = parseAuthCallback(url);
  // The camper said no on the provider's page.
  if (error && /access_denied|cancel/i.test(error)) return Promise.resolve({ status: 'cancelled' });
  if (error) {
    log.warn('The sign-in provider returned an error', { error });
    return Promise.resolve({ status: 'error', message: "Sign-in didn't work. Please try again." });
  }
  if (!code) return Promise.resolve({ status: 'error', message: "Sign-in didn't finish. Please try again." });
  return exchangeCode(client, code);
}

export async function signInWithBrowser(client: SupabaseClient, provider: AuthProviderId): Promise<SignInResult> {
  const redirectTo = authRedirectUrl();
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      // Supabase needs an email address, which Microsoft only sends when asked.
      ...(provider === 'azure' ? { scopes: 'email' } : {}),
    },
  });
  if (error || !data?.url) {
    if (error) log.warn('Could not start sign-in', { provider, message: error.message });
    return { status: 'error', message: friendlyAuthError(error ?? new Error('No sign-in link'), provider) };
  }
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return { status: 'cancelled' };
  return completeSignInFromUrl(client, result.url);
}

/** Whether this phone has the built-in Sign in with Apple sheet (iPhone, iOS 13+). */
export async function canUseNativeApple(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync().catch(() => false);
}

/**
 * Apple only shares a name on the very first sign-in, so keep it then: on the
 * account, and as the display name unless the camper has already picked one.
 */
async function saveAppleName(
  client: SupabaseClient,
  userId: string,
  fullName: AppleAuthentication.AppleAuthenticationFullName | null,
): Promise<void> {
  const given = fullName?.givenName?.trim();
  if (!given) return;
  try {
    const family = fullName?.familyName?.trim() ?? '';
    await client.auth.updateUser({
      data: { given_name: given, family_name: family || undefined, full_name: `${given} ${family}`.trim() },
    });
    const check = checkDisplayName(given);
    if (check.ok) {
      await client
        .from('profiles')
        .update({ display_name: check.name })
        .eq('id', userId)
        .eq('display_name', DEFAULT_DISPLAY_NAME);
    }
  } catch (error) {
    log.warn('Could not save the name Apple shared', { error: describeError(error) });
  }
}

export async function signInWithAppleNative(client: SupabaseClient): Promise<SignInResult> {
  // The nonce ties Apple's answer to this one request, so it can't be replayed.
  // Apple gets its SHA-256 hash; Supabase gets the original to check against it.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') return { status: 'cancelled' };
    log.warn('Sign in with Apple failed', { error: describeError(error) });
    return { status: 'error', message: "Sign in with Apple didn't work. Please try again." };
  }
  if (!credential.identityToken) {
    return { status: 'error', message: "Sign in with Apple didn't work. Please try again." };
  }
  const { data, error } = await client.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error || !data.user) {
    if (error) log.warn('Supabase rejected the Apple sign-in', { message: error.message });
    return { status: 'error', message: friendlyAuthError(error ?? new Error('No user'), 'apple') };
  }
  await saveAppleName(client, data.user.id, credential.fullName);
  return { status: 'signed-in' };
}

/** Signs in with the chosen provider. Never throws. */
export async function signInWith(client: SupabaseClient, provider: AuthProviderId): Promise<SignInResult> {
  try {
    if (provider === 'apple' && (await canUseNativeApple())) return await signInWithAppleNative(client);
    return await signInWithBrowser(client, provider);
  } catch (error) {
    log.error('Sign-in failed', error, { provider });
    return { status: 'error', message: friendlyAuthError(error, provider) };
  }
}
