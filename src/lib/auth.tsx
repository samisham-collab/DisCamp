// Who's signed in, shared with every screen. Browsing never needs an
// account; signing in lets a camper add spots and fix the ones they added.
// Without a server (no Supabase settings) sign-in is switched off: "disabled".

import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { signInWith, type SignInResult } from './authFlows';
import { enabledProviders, type AuthProviderId } from './authProviders';
import { checkDisplayName } from './displayName';
import { describeError, log } from './log';
import { useServerClient } from './server';

export type AuthStatus = 'disabled' | 'loading' | 'signed-out' | 'signed-in';

export interface AuthUser {
  id: string;
  /** Private: shown only to the camper themselves. Apple may give a relay address. */
  email: string | null;
  /** The provider used to sign in: "apple", "google", "azure" or "github". */
  provider: string | null;
}

export type ActionResult = { ok: true } | { ok: false; message: string };

interface AuthContextValue {
  /** The server connection, for screens that write. Null when there's no server. */
  client: SupabaseClient | null;
  status: AuthStatus;
  user: AuthUser | null;
  /** The public name on spots this camper adds. Null until it loads. */
  displayName: string | null;
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
  return { id, email: email ?? null, provider };
}

const OFFLINE = /network request failed|failed to fetch|network error|load failed/i;

function failure(action: string, error: unknown): ActionResult {
  const message = describeError(error && typeof error === 'object' && 'message' in error ? error.message : error);
  log.warn(`${action} failed`, { error: message });
  return {
    ok: false,
    message: OFFLINE.test(message)
      ? "You're offline or the server can't be reached. Try again when you have signal."
      : `${action} didn't work. Please try again.`,
  };
}

interface Props {
  children: ReactNode;
  /** For tests. Defaults to the configured Supabase client, if any. */
  client?: SupabaseClient | null;
  providers?: AuthProviderId[];
}

export function AuthProvider({ children, client: clientProp, providers: providersProp }: Props) {
  const client = useServerClient(clientProp);
  const [providers] = useState(() => providersProp ?? enabledProviders());
  const [status, setStatus] = useState<AuthStatus>(client ? 'loading' : 'disabled');
  const [user, setUser] = useState<AuthUser | null>(null);
  // Tagged with whose name it is, so a name never shows for the wrong account.
  const [profile, setProfile] = useState<{ userId: string; name: string } | null>(null);
  // Bumped after each sign-in, to reload the name (Apple's first sign-in sets it).
  const [profileVersion, setProfileVersion] = useState(0);

  // Follow the session: the saved one on launch, then every sign-in,
  // sign-out and token refresh. Supabase says not to call it back from inside
  // this listener, so the profile loads in its own effect below.
  useEffect(() => {
    if (!client) return undefined;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      const next = toUser(session);
      // Keep the same object while it's the same person, so screens don't
      // re-render on every token refresh.
      setUser((prev) =>
        prev && next && prev.id === next.id && prev.email === next.email && prev.provider === next.provider
          ? prev
          : next,
      );
      setStatus(next ? 'signed-in' : 'signed-out');
    });

    // Refresh tokens only while the app is open (Supabase's advice for phones).
    // iPhone can report "unknown" at launch, which counts as open.
    const sync = (state: string) => {
      if (state === 'background' || state === 'inactive') void client.auth.stopAutoRefresh();
      else void client.auth.startAutoRefresh();
    };
    sync(AppState.currentState);
    const appState = AppState.addEventListener('change', sync);

    return () => {
      subscription.unsubscribe();
      appState.remove();
      void client.auth.stopAutoRefresh();
    };
  }, [client]);

  const userId = user?.id ?? null;
  const displayName = profile && profile.userId === userId ? profile.name : null;

  useEffect(() => {
    if (!client || !userId) return undefined;
    let active = true;
    void (async () => {
      try {
        const { data, error } = await client
          .from('profiles')
          .select('display_name')
          .eq('id', userId)
          .retry(false)
          .maybeSingle();
        if (error) throw error;
        const name = (data as { display_name?: unknown } | null)?.display_name;
        if (active && typeof name === 'string') setProfile({ userId, name });
      } catch (error) {
        // The account screen shows "Camper" until the name loads.
        log.warn('Could not load the display name', { error: describeError(error) });
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
    try {
      // "local": this phone only. Other phones stay signed in.
      const { error } = await client.auth.signOut({ scope: 'local' });
      return error ? failure('Signing out', error) : { ok: true };
    } catch (error) {
      return failure('Signing out', error);
    }
  }, [client]);

  const deleteAccount = useCallback(async (): Promise<ActionResult> => {
    if (!client) return { ok: false, message: 'Deleting an account needs the DisCamp server.' };
    try {
      const { error } = await client.rpc('delete_my_account');
      if (error) return failure('Deleting your account', error);
    } catch (error) {
      return failure('Deleting your account', error);
    }
    // The account is gone on the server; forget the session on this phone.
    // Supabase may answer that the session no longer exists, which is fine.
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return { ok: true };
  }, [client]);

  const rename = useCallback(
    async (input: string): Promise<ActionResult> => {
      const check = checkDisplayName(input);
      if (!check.ok) return { ok: false, message: check.message };
      if (!client || !userId) return { ok: false, message: 'Sign in to change your name.' };
      try {
        const { error } = await client
          .from('profiles')
          .update({ display_name: check.name })
          .eq('id', userId)
          .retry(false);
        if (error) return failure('Saving your name', error);
        setProfile({ userId, name: check.name });
        return { ok: true };
      } catch (error) {
        return failure('Saving your name', error);
      }
    },
    [client, userId],
  );

  const value = useMemo(
    () => ({ client, status, user, displayName, providers, signIn, signOut, deleteAccount, rename }),
    [client, status, user, displayName, providers, signIn, signOut, deleteAccount, rename],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
