// Who's signed in, shared with every screen. Browsing never needs an
// account; signing in lets a camper add spots and fix the ones they added.
// Without a server (no Supabase settings) sign-in is switched off: "disabled".

import { isAuthRetryableFetchError, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { NETWORK_TIMEOUT_MS, REMOTE_TIMEOUT_MS, TERMS_VERSION } from '../config';
import { acceptTerms as sendAcceptTerms, ModerationError } from '../data/moderation';
import { signInWith, type SignInResult } from './authFlows';
import { DeadlineError, withDeadline } from './deadline';
import { enabledProviders, type AuthProviderId } from './authProviders';
import { checkDisplayName } from './displayName';
import { describeError, log } from './log';
import { clearPushRegistration, forgetThisPhone, turnOnPush } from './push';
import { useServerClient } from './server';
import { forgetSavedSession, readSavedSession } from './supabase';

/** The sign-in saved on this phone, read and forgotten without the server. */
export interface SavedSessionStore {
  read: () => Promise<Session | null>;
  forget: () => Promise<boolean>;
}

const SAVED_SESSION: SavedSessionStore = { read: readSavedSession, forget: forgetSavedSession };

export type AuthStatus = 'disabled' | 'loading' | 'signed-out' | 'signed-in';

export interface AuthUser {
  id: string;
  /** Private: shown only to the camper themselves. Apple may give a relay address. */
  email: string | null;
  /** The provider used to sign in: "apple", "google", "azure" or "github". */
  provider: string | null;
  /**
   * Signed in with Apple at some point. Deleting the account then needs one
   * more step in the iPhone's settings (Apple TN3194), which the app explains.
   */
  apple: boolean;
}

export type ActionResult = { ok: true } | { ok: false; message: string };

interface AuthContextValue {
  /** The server connection, for screens that write. Null when there's no server. */
  client: SupabaseClient | null;
  status: AuthStatus;
  user: AuthUser | null;
  /** The public name on spots this camper adds. Null until it loads. */
  displayName: string | null;
  /**
   * Has this camper agreed to the current terms of use? Null while their
   * profile loads. Campers agree once before their first spot.
   */
  termsAccepted: boolean | null;
  acceptTerms: () => Promise<ActionResult>;
  /** Reads the profile again (after the server says the terms changed, say). */
  reloadProfile: () => void;
  providers: AuthProviderId[];
  signIn: (provider: AuthProviderId) => Promise<SignInResult>;
  signOut: () => Promise<ActionResult>;
  deleteAccount: () => Promise<ActionResult>;
  rename: (name: string) => Promise<ActionResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null;
  const { id, email, app_metadata } = session.user;
  const provider = typeof app_metadata?.provider === 'string' ? app_metadata.provider : null;
  const providers: unknown = app_metadata?.providers;
  const apple = provider === 'apple' || (Array.isArray(providers) && providers.includes('apple'));
  return { id, email: email ?? null, provider, apple };
}

interface Profile {
  /** Whose profile it is, so it never shows for the wrong account. */
  userId: string;
  name: string | null;
  termsVersion: number | null;
}

const OFFLINE = /network request failed|failed to fetch|network error|load failed/i;

function failure(action: string, error: unknown): ActionResult {
  if (error instanceof DeadlineError) {
    return { ok: false, message: 'The server took too long to answer. Try again when you have better signal.' };
  }
  const message = describeError(error && typeof error === 'object' && 'message' in error ? error.message : error);
  log.warn(`${action} failed`, { error: message });
  return {
    ok: false,
    message: OFFLINE.test(message)
      ? "You're offline or the server can't be reached. Try again when you have signal."
      : `${action} didn't work. Please try again.`,
  };
}

async function signedInHere(client: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await client.auth.getSession();
    // Couldn't read it (say, an expired token it can't renew offline): it's
    // still there, so the camper is still signed in.
    return data.session != null || error != null;
  } catch {
    return true;
  }
}

interface Props {
  children: ReactNode;
  /** For tests. Defaults to the configured Supabase client, if any. */
  client?: SupabaseClient | null;
  providers?: AuthProviderId[];
  /** For tests. Defaults to the configured client's storage. */
  savedSession?: SavedSessionStore;
}

export function AuthProvider({ children, client: clientProp, providers: providersProp, savedSession }: Props) {
  const client = useServerClient(clientProp);
  const [providers] = useState(() => providersProp ?? enabledProviders());
  const [saved] = useState(() => savedSession ?? SAVED_SESSION);
  const [status, setStatus] = useState<AuthStatus>(client ? 'loading' : 'disabled');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Bumped after each sign-in, to reload the name (Apple's first sign-in sets it).
  const [profileVersion, setProfileVersion] = useState(0);

  // Follow the session: the saved one on launch, then every sign-in,
  // sign-out and token refresh. Supabase says not to call it back from inside
  // this listener, so the profile loads in its own effect below.
  useEffect(() => {
    if (!client) return undefined;
    let active = true;
    // Counts what Supabase has said, so a slower read of the saved sign-in
    // never overrides something newer.
    let said = 0;
    const show = (session: Session | null) => {
      const next = toUser(session);
      // Keep the same object while it's the same person, so screens don't
      // re-render on every token refresh.
      setUser((prev) =>
        prev &&
        next &&
        prev.id === next.id &&
        prev.email === next.email &&
        prev.provider === next.provider &&
        prev.apple === next.apple
          ? prev
          : next,
      );
      setStatus(next ? 'signed-in' : 'signed-out');
    };
    const showSaved = (asOf: number, orSignedOut: boolean) => {
      saved.read().then(
        (session) => {
          if (!active || said !== asOf) return;
          if (session || orSignedOut) show(session);
        },
        () => {
          if (active && said === asOf && orSignedOut) show(null);
        },
      );
    };

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      said += 1;
      // Offline with an expired token, Supabase can't renew it and says
      // "nobody" after about 30 seconds, but keeps the sign-in to renew when
      // the signal's back. Still signed in, then, if it's still saved.
      if (event === 'INITIAL_SESSION' && !session) showSaved(said, true);
      else show(session);
    });
    // Meanwhile, the saved sign-in shows at once instead of a wait.
    showSaved(0, false);

    // Refresh tokens only while the app is open (Supabase's advice for phones).
    // iPhone can report "unknown" at launch, which counts as open.
    const sync = (state: string) => {
      if (state === 'background' || state === 'inactive') void client.auth.stopAutoRefresh();
      else void client.auth.startAutoRefresh();
    };
    sync(AppState.currentState);
    const appState = AppState.addEventListener('change', sync);

    return () => {
      active = false;
      subscription.unsubscribe();
      appState.remove();
      void client.auth.stopAutoRefresh();
    };
  }, [client, saved]);

  const userId = user?.id ?? null;
  const mine = profile && profile.userId === userId ? profile : null;
  const displayName = mine?.name ?? null;
  const termsAccepted = mine ? mine.termsVersion != null && mine.termsVersion >= TERMS_VERSION : null;

  useEffect(() => {
    if (!client || !userId) return undefined;
    let active = true;
    void (async () => {
      try {
        const { data, error } = await withDeadline(
          async (signal) =>
            client
              .from('profiles')
              .select('display_name, terms_version')
              .eq('id', userId)
              .retry(false)
              .abortSignal(signal)
              .maybeSingle(),
          REMOTE_TIMEOUT_MS,
        );
        if (error) throw error;
        const row = (data ?? {}) as { display_name?: unknown; terms_version?: unknown };
        if (active) {
          setProfile({
            userId,
            name: typeof row.display_name === 'string' ? row.display_name : null,
            termsVersion: typeof row.terms_version === 'number' ? row.terms_version : null,
          });
        }
      } catch (error) {
        // The account screen shows "Camper" until the name loads. Not knowing
        // whether the terms were agreed to, the app asks again; agreeing twice
        // is harmless.
        log.warn('Could not load the profile', { error: describeError(error) });
        if (active) setProfile({ userId, name: null, termsVersion: null });
      }
    })();
    return () => {
      active = false;
    };
  }, [client, userId, profileVersion]);

  const signIn = useCallback(
    async (provider: AuthProviderId): Promise<SignInResult> => {
      if (!client) return { status: 'error', message: 'Sign-in needs the DisCamp server.' };
      const result = await signInWith(client, provider);
      if (result.status === 'signed-in') setProfileVersion((v) => v + 1);
      return result;
    },
    [client],
  );

  const signOut = useCallback(async (): Promise<ActionResult> => {
    if (!client) return { ok: true };
    // While still signed in: this phone stops getting the camper's notifications.
    await forgetThisPhone(client);
    try {
      // "local": this phone only. Other phones stay signed in.
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (!error) return { ok: true };
      // Offline, Supabase can't tell the server, but it still forgets the
      // session on this phone: that's signed out, as far as the camper goes.
      if (!(await signedInHere(client))) return { ok: true };
      // With an expired token it can't even do that offline, so DisCamp
      // forgets the sign-in itself: signing out never needs signal.
      if (isAuthRetryableFetchError(error) && (await saved.forget())) {
        setUser(null);
        setStatus('signed-out');
        return { ok: true };
      }
      void turnOnPush(client, { ask: false }); // still signed in: keep their notifications
      return failure('Signing out', error);
    } catch (error) {
      void turnOnPush(client, { ask: false });
      return failure('Signing out', error);
    }
  }, [client, saved]);

  const deleteAccount = useCallback(async (): Promise<ActionResult> => {
    if (!client) return { ok: false, message: 'Deleting an account needs the DisCamp server.' };
    try {
      // A longer wait than usual: giving up early on a deletion that then
      // goes through would leave the camper unsure whether it happened.
      const { error } = await withDeadline(
        async (signal) => client.rpc('delete_my_account').abortSignal(signal),
        NETWORK_TIMEOUT_MS,
      );
      if (error) return failure('Deleting your account', error);
    } catch (error) {
      return failure('Deleting your account', error);
    }
    // The account is gone on the server (its push addresses too); forget the
    // session on this phone. Supabase may answer that the session no longer
    // exists, which is fine.
    clearPushRegistration();
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return { ok: true };
  }, [client]);

  const rename = useCallback(
    async (input: string): Promise<ActionResult> => {
      const check = checkDisplayName(input);
      if (!check.ok) return { ok: false, message: check.message };
      if (!client || !userId) return { ok: false, message: 'Sign in to change your name.' };
      try {
        const { error } = await withDeadline(
          async (signal) =>
            client
              .from('profiles')
              .update({ display_name: check.name })
              .eq('id', userId)
              .retry(false)
              .abortSignal(signal),
          REMOTE_TIMEOUT_MS,
        );
        if (error) {
          if (error.message === 'blocked_words') {
            return { ok: false, message: "Pick a name without words that aren't allowed on DisCamp." };
          }
          if (error.message === 'banned') return { ok: false, message: "Your account can't change its name." };
          if (error.message === 'name_under_review') {
            return {
              ok: false,
              message:
                'Other campers reported your name, so it shows as "Camper" until DisCamp reviews it. You can change it after that.',
            };
          }
          return failure('Saving your name', error);
        }
        setProfile((p) => ({ userId, name: check.name, termsVersion: p?.userId === userId ? p.termsVersion : null }));
        return { ok: true };
      } catch (error) {
        return failure('Saving your name', error);
      }
    },
    [client, userId],
  );

  const acceptTerms = useCallback(async (): Promise<ActionResult> => {
    if (!client || !userId) return { ok: false, message: 'Sign in first.' };
    try {
      await sendAcceptTerms(client, TERMS_VERSION);
    } catch (error) {
      return { ok: false, message: error instanceof ModerationError ? error.message : describeError(error) };
    }
    setProfile((p) => ({ userId, name: p?.userId === userId ? p.name : null, termsVersion: TERMS_VERSION }));
    return { ok: true };
  }, [client, userId]);

  const reloadProfile = useCallback(() => setProfileVersion((v) => v + 1), []);

  const value = useMemo(
    () => ({
      client,
      status,
      user,
      displayName,
      termsAccepted,
      acceptTerms,
      reloadProfile,
      providers,
      signIn,
      signOut,
      deleteAccount,
      rename,
    }),
    [
      client,
      status,
      user,
      displayName,
      termsAccepted,
      acceptTerms,
      reloadProfile,
      providers,
      signIn,
      signOut,
      deleteAccount,
      rename,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
