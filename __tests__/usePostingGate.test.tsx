// Before posting: a tap that comes before the saved sign-in has loaded says
// so, instead of doing nothing or sending a signed-in camper to sign in.

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, AppState } from 'react-native';

import { CleanupsProvider, useCleanups } from '@/data/cleanupsStore';
import { AuthProvider } from '@/lib/auth';
import { usePostingGate } from '@/lib/usePostingGate';

import { fakeBackend, SAM, type FakeBackend } from '../test/fakeSupabase';

function withAuth(backend: FakeBackend) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <AuthProvider client={backend.client}>{children}</AuthProvider>;
  };
}

function withCleanups(backend: FakeBackend) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthProvider client={backend.client}>
        <CleanupsProvider>{children}</CleanupsProvider>
      </AuthProvider>
    );
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('usePostingGate', () => {
  it('asks for a moment while the saved sign-in loads', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const backend = fakeBackend();
    // The saved session hasn't been read yet.
    backend.auth.onAuthStateChange.mockImplementation(
      () => ({ data: { subscription: { unsubscribe: () => undefined } } }) as never,
    );
    const { result } = renderHook(() => usePostingGate(), { wrapper: withAuth(backend) });
    expect(result.current('/spot/new')).toBe(false);
    expect(alert).toHaveBeenCalledWith('One moment', 'DisCamp is still checking your sign-in. Try again in a second.');
  });

  it('asks for a moment while a signed-in camper’s profile loads', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const backend = fakeBackend();
    // Hold the first profile load; later ones answer as usual.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    backend.intercept = (query) => {
      if (query.table !== 'profiles') return undefined;
      backend.intercept = null;
      return held.then(() => ({ data: { display_name: 'Sam', terms_version: 2 }, error: null }));
    };
    backend.auth.setUser(SAM);
    const { result } = renderHook(() => usePostingGate(), { wrapper: withAuth(backend) });
    await waitFor(() => expect(result.current('/spot/new')).toBe(false));
    expect(alert).toHaveBeenLastCalledWith('One moment', expect.any(String));
    // Once the profile is in, the camper can go ahead.
    await act(async () => release());
    await waitFor(() => expect(result.current('/spot/new')).toBe(true));
  });
});

describe('CleanupsProvider', () => {
  it('loads again when the app comes back after a while', async () => {
    const handlers: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      handlers.push(handler as (state: string) => void);
      return { remove: () => undefined } as never;
    });
    const backend = fakeBackend();
    const loads = () => backend.queries.filter((q) => q.table === 'cleanup_tasks_api').length;
    const { result } = renderHook(() => useCleanups(), { wrapper: withCleanups(backend) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = loads();

    act(() => handlers.forEach((h) => h('active')));
    expect(loads()).toBe(before);

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60 * 1000);
    await act(async () => handlers.forEach((h) => h('active')));
    await waitFor(() => expect(loads()).toBe(before + 1));
  });
});
