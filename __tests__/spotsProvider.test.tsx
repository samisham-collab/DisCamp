import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReactNode } from 'react';

import { STORAGE_KEYS } from '@/config';
import { SEED_SPOTS } from '@/data/seedSpots';
import { SpotsProvider, useSpot, useSpots } from '@/data/spots';
import { kvStore } from '@/lib/kvStore';

import { ALEX, fakeBackend, fakeClient, SAM, type QueryResult } from '../test/fakeSupabase';
import { makeRow } from '../test/fixtures';

function wrapperFor(client: SupabaseClient | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <SpotsProvider client={client}>{children}</SpotsProvider>;
  };
}

function renderSpots(respond: (signal: AbortSignal) => Promise<QueryResult>) {
  return renderHook(() => useSpots(), { wrapper: wrapperFor(fakeClient(respond)) });
}

describe('SpotsProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses starter spots alone when no server is set up', async () => {
    const { result } = renderHook(() => useSpots(), { wrapper: wrapperFor(null) });
    expect(result.current).toMatchObject({ spots: SEED_SPOTS, source: 'seed', loading: false, remoteEnabled: false });
    await act(() => result.current.refresh());
    expect(result.current.source).toBe('seed');
  });

  it('replaces starter spots with the server copy and saves it', async () => {
    const { result } = renderSpots(async () => ({ data: [makeRow({ id: 'server-spot' })], error: null }));
    await waitFor(() => expect(result.current.source).toBe('remote'));
    expect(result.current.spots.map((s) => s.id)).toEqual(['server-spot']);
    expect(result.current.updatedAt).toEqual(expect.any(String));
    await waitFor(async () => expect(await kvStore.getItem(STORAGE_KEYS.spotsCache)).toContain('server-spot'));
  });

  it('keeps the spots on screen when the server has none', async () => {
    const { result } = renderSpots(async () => ({ data: [], error: null }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('The server has no spots yet.');
    expect(result.current.spots).toEqual(SEED_SPOTS);
  });

  it('says so when no server row can be read', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = renderSpots(async () => ({ data: [{ id: 'broken' }], error: null }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Spots from the server couldn't be read.");
    expect(result.current.spots).toEqual(SEED_SPOTS);
  });

  it('shares one request between overlapping refreshes', async () => {
    const respond = jest.fn(async () => ({ data: [makeRow()], error: null }));
    const { result } = renderSpots(respond);
    await waitFor(() => expect(result.current.source).toBe('remote'));
    await act(async () => {
      const first = result.current.refresh();
      const second = result.current.refresh();
      expect(second).toBe(first);
      await first;
    });
    expect(respond).toHaveBeenCalledTimes(2);
  });

  it('ignores a response that arrives after the app closed', async () => {
    let finish: (result: QueryResult) => void = () => undefined;
    const { result, unmount } = renderSpots(() => new Promise((resolve) => (finish = resolve)));
    await waitFor(() => expect(result.current.refreshing).toBe(true));
    unmount();
    await act(async () => {
      finish({ data: [makeRow()], error: null });
      await Promise.resolve();
    });
    expect(await kvStore.getItem(STORAGE_KEYS.spotsCache)).toBeNull();
  });

  it('loads again when someone else signs in or out, not on token refreshes', async () => {
    const backend = fakeBackend([makeRow({ id: 'a', name: 'Alex Hollow', created_by: ALEX.id, added_by: 'Alex' })]);
    const { result } = renderHook(() => useSpots(), { wrapper: wrapperFor(backend.client) });
    await waitFor(() => expect(result.current.source).toBe('remote'));
    const loads = () => backend.queries.filter((q) => q.table === 'spots_api').length;
    expect(loads()).toBe(1);

    act(() => backend.auth.setUser(SAM));
    await waitFor(() => expect(loads()).toBe(2));
    act(() => backend.auth.setUser(SAM, 'TOKEN_REFRESHED'));
    act(() => backend.auth.setUser(null));
    await waitFor(() => expect(loads()).toBe(3));
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });

  it('drops a server answer that started before a block, and loads again', async () => {
    const backend = fakeBackend([
      makeRow({ id: 'a', name: 'Alex Hollow', created_by: ALEX.id, added_by: 'Alex' }),
      makeRow({ id: 'b', name: 'Smoky Gardens' }),
    ]);
    const { result } = renderHook(() => useSpots(), { wrapper: wrapperFor(backend.client) });
    await waitFor(() => expect(result.current.source).toBe('remote'));

    // A refresh is on its way with Alex's spot in it when Alex is blocked.
    let answer: (r: QueryResult) => void = () => undefined;
    backend.intercept = (query) =>
      query.table === 'spots_api' ? new Promise<QueryResult>((resolve) => (answer = resolve)) : undefined;
    let refreshing: Promise<void> = Promise.resolve();
    act(() => {
      refreshing = result.current.refresh();
    });
    act(() => result.current.removeByCreator(ALEX.id));
    backend.intercept = null;
    const stale = [...backend.spots.values()];
    backend.spots.delete('a'); // From now on the server leaves Alex's spot out.
    await act(async () => {
      answer({ data: stale, error: null });
      await refreshing;
    });
    // The old answer (with Alex's spot) was dropped; the next load agrees.
    expect(result.current.spots.map((s) => s.id)).toEqual(['b']);
    const loads = backend.queries.filter((q) => q.table === 'spots_api').length;
    expect(loads).toBe(3);
  });

  it('drops a blocked camper’s spots at once', async () => {
    const backend = fakeBackend([
      makeRow({ id: 'a', name: 'Alex Hollow', created_by: ALEX.id, added_by: 'Alex' }),
      makeRow({ id: 'b', name: 'Smoky Gardens' }),
    ]);
    const { result } = renderHook(() => useSpots(), { wrapper: wrapperFor(backend.client) });
    await waitFor(() => expect(result.current.spots).toHaveLength(2));
    act(() => result.current.removeByCreator(ALEX.id));
    expect(result.current.spots.map((s) => s.id)).toEqual(['b']);
    // And the offline copy follows.
    await waitFor(async () => expect(await kvStore.getItem(STORAGE_KEYS.spotsCache)).not.toContain('Alex Hollow'));
  });

  it('keeps the offline copy as old as it is after a local change', async () => {
    await kvStore.setItem(
      STORAGE_KEYS.spotsCache,
      JSON.stringify({ version: 1, savedAt: '2026-10-01T00:00:00.000Z', spots: [SEED_SPOTS[0]] }),
    );
    // The server can't be reached, so the saved copy stays on screen.
    const { result } = renderSpots(async () => ({ data: null, error: { message: 'Network request failed' } }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.updatedAt).toBe('2026-10-01T00:00:00.000Z');
    act(() => result.current.removeLocal(SEED_SPOTS[0]!.id));
    await waitFor(async () => {
      const saved = JSON.parse((await kvStore.getItem(STORAGE_KEYS.spotsCache)) ?? '{}') as {
        spots: unknown[];
        savedAt: string;
      };
      expect(saved).toMatchObject({ spots: [], savedAt: '2026-10-01T00:00:00.000Z' });
    });
  });

  it('takes spots hidden for review off at once when someone else signs in', async () => {
    const backend = fakeBackend([
      makeRow({ id: 'h', name: 'Under Review', created_by: SAM.id, added_by: 'Sam' }),
      makeRow({ id: 'b', name: 'Smoky Gardens' }),
    ]);
    backend.spots.get('h')!.hidden = true;
    backend.auth.setUser(SAM);
    const { result } = renderHook(() => useSpots(), { wrapper: wrapperFor(backend.client) });
    await waitFor(() => expect(result.current.spots.map((s) => s.id)).toEqual(['b', 'h']));
    // Signing out with no signal: the reload fails, but Sam's hidden spot goes.
    backend.intercept = () => Promise.resolve({ data: null, error: { message: 'Network request failed' } });
    const asked = backend.queries.length;
    act(() => backend.auth.setUser(null));
    expect(result.current.spots.map((s) => s.id)).toEqual(['b']);
    // The reload starts a moment later; wait for it to finish, not just to be due.
    await waitFor(() => expect(backend.queries.length).toBeGreaterThan(asked));
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });

  it('reloads after unblocking even while a load is on its way', async () => {
    const backend = fakeBackend([makeRow({ id: 'a', name: 'Alex Hollow', created_by: ALEX.id, added_by: 'Alex' })]);
    const { result } = renderHook(() => useSpots(), { wrapper: wrapperFor(backend.client) });
    await waitFor(() => expect(result.current.source).toBe('remote'));
    let answer: (r: QueryResult) => void = () => undefined;
    backend.intercept = (query) =>
      query.table === 'spots_api' ? new Promise<QueryResult>((resolve) => (answer = resolve)) : undefined;
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.refresh();
    });
    backend.intercept = null;
    let reloading: Promise<void> = Promise.resolve();
    act(() => {
      reloading = result.current.reload();
    });
    await act(async () => {
      answer({ data: [], error: null });
      await first;
      await reloading;
    });
    // The old (empty) answer was dropped and the spots loaded again.
    expect(result.current.spots.map((s) => s.id)).toEqual(['a']);
  });

  it('finds one spot by id', () => {
    const { result } = renderHook(() => [useSpot('smoky-gardens'), useSpot('nope'), useSpot(undefined)], {
      wrapper: wrapperFor(null),
    });
    const [found, missing, none] = result.current;
    expect(found?.spot?.name).toBe('Smoky Gardens');
    expect(missing?.spot).toBeUndefined();
    expect(none?.spot).toBeUndefined();
  });

  it('explains a missing provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useSpots())).toThrow('useSpots must be used inside <SpotsProvider>');
  });
});
