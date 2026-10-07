import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReactNode } from 'react';

import { STORAGE_KEYS } from '@/config';
import { SEED_SPOTS } from '@/data/seedSpots';
import { SpotsProvider, useSpot, useSpots } from '@/data/spots';
import { kvStore } from '@/lib/kvStore';

import { fakeClient, type QueryResult } from '../test/fakeSupabase';
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
