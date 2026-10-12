import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { ServerProvider, useServerClient } from '@/lib/server';
import { getSupabase } from '@/lib/supabase';

import { ALEX, fakeBackend, NEWBIE, SAM, type FakeBackend } from '../test/fakeSupabase';

function renderAuth(backend: FakeBackend | null) {
  const client: SupabaseClient | null = backend?.client ?? null;
  return renderHook(() => useAuth(), {
    wrapper: ({ children }: { children: ReactNode }) => <AuthProvider client={client}>{children}</AuthProvider>,
  });
}

const silence = (level: 'warn' | 'error') => jest.spyOn(console, level).mockImplementation(() => undefined);

describe('AuthProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('turns accounts off without a server', async () => {
    const { result } = renderAuth(null);
    expect(result.current).toMatchObject({ status: 'disabled', user: null, client: null });
    expect(await result.current.signIn('google')).toEqual({
      status: 'error',
      message: 'Sign-in needs the DisCamp server.',
    });
    expect(await result.current.signOut()).toEqual({ ok: true });
    expect(await result.current.deleteAccount()).toEqual({
      ok: false,
      message: 'Deleting an account needs the DisCamp server.',
    });
    expect(await result.current.rename('Sam')).toEqual({ ok: false, message: 'Sign in to change your name.' });
  });

  it('checks the saved sign-in, then reports signed out', async () => {
    const { result } = renderAuth(fakeBackend());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('signed-out'));
    expect(result.current.providers).toEqual(['apple', 'google', 'azure', 'github']);
  });

  it('restores a saved sign-in and loads the display name', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    const { result } = renderAuth(backend);
    await waitFor(() => expect(result.current.displayName).toBe('Sam'));
    expect(result.current).toMatchObject({
      status: 'signed-in',
      user: { id: SAM.id, email: 'sam@example.com', provider: 'google' },
    });
  });

  it('signs in, keeps the same user through token refreshes, and switches accounts cleanly', async () => {
    const backend = fakeBackend();
    const { result } = renderAuth(backend);
    await waitFor(() => expect(result.current.status).toBe('signed-out'));

    await act(async () => {
      expect(await result.current.signIn('github')).toEqual({ status: 'signed-in' });
    });
    await waitFor(() => expect(result.current.displayName).toBe('Sam'));
    const user = result.current.user;
    act(() => backend.auth.setUser(SAM, 'TOKEN_REFRESHED'));
    expect(result.current.user).toBe(user);

    // A different account never shows the previous account's name.
    act(() => backend.auth.setUser(ALEX));
    expect(result.current.user?.id).toBe(ALEX.id);
    expect(result.current.displayName).not.toBe('Sam');
    await waitFor(() => expect(result.current.displayName).toBe('Alex'));
  });

  it('renames, checking the name first', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    const { result } = renderAuth(backend);
    await waitFor(() => expect(result.current.displayName).toBe('Sam'));

    expect(await result.current.rename('sam@example.com')).toEqual({
      ok: false,
      message: "Use a name, not an email address (no '@').",
    });
    await act(async () => {
      expect(await result.current.rename('  Sam   I. ')).toEqual({ ok: true });
    });
    expect(result.current.displayName).toBe('Sam I.');
    expect(backend.profiles.get(SAM.id)).toBe('Sam I.');

    const warn = silence('warn');
    backend.intercept = () => Promise.resolve({ data: null, error: { message: 'Network request failed' } });
    expect(await result.current.rename('Sammy')).toEqual({
      ok: false,
      message: "You're offline or the server can't be reached. Try again when you have signal.",
    });
    backend.intercept = () => Promise.reject(new Error('boom'));
    expect(await result.current.rename('Sammy')).toEqual({
      ok: false,
      message: "Saving your name didn't work. Please try again.",
    });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('refuses names the server won’t take', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    const { result } = renderAuth(backend);
    await waitFor(() => expect(result.current.displayName).toBe('Sam'));
    expect(await result.current.rename('Shit Head')).toEqual({
      ok: false,
      message: "Pick a name without words that aren't allowed on DisCamp.",
    });
    // The server's word list can be longer than the app's.
    backend.intercept = () => Promise.resolve({ data: null, error: { message: 'blocked_words', code: 'P0001' } });
    expect(await result.current.rename('Litter Bug')).toEqual({
      ok: false,
      message: "Pick a name without words that aren't allowed on DisCamp.",
    });
    backend.intercept = null;
    for (const reporter of ['a', 'b', 'c']) {
      backend.flags.push({ reporter, camperId: SAM.id, reason: 'offensive', status: 'open' });
    }
    expect(await result.current.rename('Sammy')).toEqual({
      ok: false,
      message: expect.stringContaining('Other campers reported your name'),
    });
    backend.banned.add(SAM.id);
    expect(await result.current.rename('Sammy')).toEqual({ ok: false, message: "Your account can't change its name." });
  });

  it('knows whether the camper agreed to the terms, and records agreeing', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(NEWBIE);
    const { result } = renderAuth(backend);
    expect(result.current.termsAccepted).toBeNull();
    await waitFor(() => expect(result.current.termsAccepted).toBe(false));
    await act(async () => {
      expect(await result.current.acceptTerms()).toEqual({ ok: true });
    });
    expect(result.current.termsAccepted).toBe(true);
    expect(result.current.displayName).toBe('Robin');

    // Agreeing can fail, and the camper hears why.
    backend.intercept = () => Promise.resolve({ data: null, error: { message: 'terms_outdated', code: 'P0001' } });
    expect(await result.current.acceptTerms()).toEqual({
      ok: false,
      message: expect.stringContaining('DisCamp has new terms of use'),
    });
    backend.intercept = () => Promise.reject('odd');
    silence('error');
    expect((await result.current.acceptTerms()).ok).toBe(false);
    backend.intercept = null;

    // Reloading reads the profile again.
    backend.terms.delete(NEWBIE.id);
    act(() => result.current.reloadProfile());
    await waitFor(() => expect(result.current.termsAccepted).toBe(false));
  });

  it('can’t agree to the terms signed out or without a server', async () => {
    expect(await renderAuth(null).result.current.acceptTerms()).toEqual({ ok: false, message: 'Sign in first.' });
  });

  it('knows who signed in with Apple, even through a linked account', async () => {
    const backend = fakeBackend();
    backend.auth.setUser({ ...SAM, provider: 'apple' });
    const { result } = renderAuth(backend);
    await waitFor(() => expect(result.current.user?.apple).toBe(true));
    act(() => backend.auth.setUser(ALEX));
    expect(result.current.user?.apple).toBe(false);
    act(() => backend.auth.setUser({ ...ALEX, providers: ['github', 'apple'] }, 'USER_UPDATED'));
    expect(result.current.user?.apple).toBe(true);
    await waitFor(() => expect(result.current.displayName).toBe('Alex'));
  });

  it('signs out of this phone only', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    const { result } = renderAuth(backend);
    await waitFor(() => expect(result.current.status).toBe('signed-in'));
    await act(async () => {
      expect(await result.current.signOut()).toEqual({ ok: true });
    });
    expect(backend.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(result.current).toMatchObject({ status: 'signed-out', user: null, displayName: null });
  });

  it('reports a sign-out that fails', async () => {
    const warn = silence('warn');
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    const { result } = renderAuth(backend);
    await waitFor(() => expect(result.current.status).toBe('signed-in'));
    backend.auth.signOut.mockResolvedValueOnce({ error: { message: 'Failed to fetch' } });
    expect(await result.current.signOut()).toEqual({
      ok: false,
      message: "You're offline or the server can't be reached. Try again when you have signal.",
    });
    backend.auth.signOut.mockRejectedValueOnce(new Error('boom'));
    expect(await result.current.signOut()).toEqual({
      ok: false,
      message: "Signing out didn't work. Please try again.",
    });
    expect(warn).toHaveBeenCalledTimes(2);

    // Offline, Supabase can't reach the server but still forgets the session
    // on this phone: that counts as signed out.
    backend.auth.signOut.mockImplementationOnce(async () => {
      act(() => backend.auth.setUser(null));
      return { error: { message: 'Failed to fetch' } };
    });
    expect(await result.current.signOut()).toEqual({ ok: true });
    await waitFor(() => expect(result.current.status).toBe('signed-out'));
    // And if it can't even tell, assume still signed in.
    backend.auth.getSession.mockRejectedValueOnce(new Error('storage broke'));
    backend.auth.signOut.mockResolvedValueOnce({ error: { message: 'Failed to fetch' } });
    expect((await result.current.signOut()).ok).toBe(false);
    // Or when the session is there but can't be renewed offline.
    act(() => backend.auth.setUser(SAM));
    await waitFor(() => expect(result.current.termsAccepted).toBe(true));
    backend.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Failed to fetch' },
    });
    backend.auth.signOut.mockResolvedValueOnce({ error: { message: 'Failed to fetch' } });
    expect((await result.current.signOut()).ok).toBe(false);
  });

  it('deletes the account on the server, then forgets it here', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    const { result } = renderAuth(backend);
    await waitFor(() => expect(result.current.status).toBe('signed-in'));
    await act(async () => {
      expect(await result.current.deleteAccount()).toEqual({ ok: true });
    });
    expect(backend.rpc).toHaveBeenCalledWith('delete_my_account');
    expect(backend.profiles.has(SAM.id)).toBe(false);
    expect(result.current.status).toBe('signed-out');
  });

  it('keeps the account when the server can’t delete it', async () => {
    const warn = silence('warn');
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    const { result } = renderAuth(backend);
    await waitFor(() => expect(result.current.status).toBe('signed-in'));
    backend.intercept = (query) =>
      query.op === 'rpc' ? Promise.resolve({ data: null, error: { message: 'Network request failed' } }) : undefined;
    expect((await result.current.deleteAccount()).ok).toBe(false);
    backend.intercept = (query) => (query.op === 'rpc' ? Promise.reject(new Error('boom')) : undefined);
    expect(await result.current.deleteAccount()).toEqual({
      ok: false,
      message: "Deleting your account didn't work. Please try again.",
    });
    expect(backend.auth.signOut).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('carries on without the display name if it can’t load', async () => {
    const warn = silence('warn');
    const backend = fakeBackend();
    backend.intercept = (query) =>
      query.table === 'profiles' ? Promise.resolve({ data: null, error: { message: 'boom' } }) : undefined;
    backend.auth.setUser(SAM);
    const { result } = renderAuth(backend);
    await waitFor(() => expect(warn).toHaveBeenCalledWith('[DisCamp] Could not load the profile', expect.anything()));
    // Not knowing whether the terms were agreed to, the app asks again.
    expect(result.current).toMatchObject({ status: 'signed-in', displayName: null, termsAccepted: false });
  });

  it('refreshes tokens only while the app is open', async () => {
    let onChange: (state: AppStateStatus) => void = () => undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      onChange = listener as (state: AppStateStatus) => void;
      return { remove } as ReturnType<typeof AppState.addEventListener>;
    });
    const backend = fakeBackend();
    const { unmount } = renderAuth(backend);
    await waitFor(() => expect(backend.auth.onAuthStateChange).toHaveBeenCalled());
    // Open at launch.
    expect(backend.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(backend.auth.stopAutoRefresh).not.toHaveBeenCalled();
    backend.auth.startAutoRefresh.mockClear();
    onChange('background');
    expect(backend.auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    onChange('active');
    expect(backend.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    unmount();
    expect(remove).toHaveBeenCalled();
    expect(backend.auth.stopAutoRefresh).toHaveBeenCalledTimes(2);
  });

  it('throws if used outside the provider', () => {
    silence('error');
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used inside <AuthProvider>');
  });
});

describe('ServerProvider', () => {
  it('shares one client, and falls back to the configured one', () => {
    const backend = fakeBackend();
    const shared = renderHook(() => useServerClient(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ServerProvider client={backend.client}>{children}</ServerProvider>
      ),
    });
    expect(shared.result.current).toBe(backend.client);

    jest.mocked(getSupabase).mockReturnValueOnce(backend.client);
    const configured = renderHook(() => useServerClient(), {
      wrapper: ({ children }: { children: ReactNode }) => <ServerProvider>{children}</ServerProvider>,
    });
    expect(configured.result.current).toBe(backend.client);

    expect(renderHook(() => useServerClient()).result.current).toBeNull();
    expect(renderHook(() => useServerClient(backend.client)).result.current).toBe(backend.client);
  });
});
