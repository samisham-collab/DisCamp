import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { SEED_SPOTS } from '@/data/seedSpots';
import {
  SpotsLoadError,
  fetchRemoteSpots,
  loadCachedSpots,
  parseSpotRows,
  saveCachedSpots,
} from '@/data/spotsRepository';
import { SERVER_ROW_LIMIT, STORAGE_KEYS } from '@/config';
import { kvStore } from '@/lib/kvStore';

import { fakeClient, retries } from '../test/fakeSupabase';
import { makeRow } from '../test/fixtures';

describe('parseSpotRows', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps good rows and counts the bad and duplicate ones', () => {
    const { spots, skipped } = parseSpotRows([
      makeRow({ id: 'a' }),
      makeRow({ id: 'b', latitude: 'nowhere' }),
      makeRow({ id: 'a', name: 'Duplicate' }),
      null,
      'junk',
      makeRow({ id: 'c' }),
    ]);
    expect(spots.map((s) => s.id)).toEqual(['a', 'c']);
    expect(skipped).toBe(4);
  });
});

describe('fetchRemoteSpots', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('returns parsed spots', async () => {
    const client = fakeClient(async () => ({ data: [makeRow({ id: 'x' })], error: null }));
    const result = await fetchRemoteSpots(client, 5_000);
    expect(result.spots.map((s) => s.id)).toEqual(['x']);
    expect(result.skipped).toBe(0);
    // One attempt per request: no hidden library retries before "offline" shows.
    expect(retries.at(-1)).toBe(false);
  });

  it('warns when the server may have cut the list short', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rows = Array.from({ length: SERVER_ROW_LIMIT }, (_, i) => makeRow({ id: `spot-${i}` }));
    const client = fakeClient(async () => ({ data: rows, error: null }));
    const result = await fetchRemoteSpots(client, 5_000);
    expect(result.spots).toHaveLength(SERVER_ROW_LIMIT);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('maximum number of spots'), { rows: SERVER_ROW_LIMIT });
  });

  it('treats a missing data array as no spots', async () => {
    const client = fakeClient(async () => ({ data: null, error: null }));
    await expect(fetchRemoteSpots(client, 5_000)).resolves.toEqual({ spots: [], skipped: 0 });
  });

  it('explains being offline', async () => {
    const client = fakeClient(async () => ({ data: null, error: { message: 'TypeError: Network request failed' } }));
    await expect(fetchRemoteSpots(client, 5_000)).rejects.toMatchObject({ kind: 'offline' });
  });

  it('explains a server error', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = fakeClient(async () => ({ data: null, error: { message: 'permission denied', code: '42501' } }));
    const error = await fetchRemoteSpots(client, 5_000).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpotsLoadError);
    expect(error).toMatchObject({ kind: 'server', message: "The server couldn't send spots right now." });
  });

  it('explains a thrown network failure', async () => {
    const client = fakeClient(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(fetchRemoteSpots(client, 5_000)).rejects.toMatchObject({ kind: 'offline' });
  });

  it('explains an unexpected throw', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = fakeClient(() => Promise.reject(new Error('boom')));
    await expect(fetchRemoteSpots(client, 5_000)).rejects.toMatchObject({ kind: 'server' });
  });

  it('gives up after the timeout', async () => {
    jest.useFakeTimers();
    const client = fakeClient(
      (signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve({ data: null, error: { message: 'AbortError: aborted' } }));
        }),
    );
    const pending = fetchRemoteSpots(client, 1_000);
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    await jest.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it('reports a timeout even if the request throws after aborting', async () => {
    jest.useFakeTimers();
    const client = fakeClient(
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('The operation was aborted')));
        }),
    );
    const pending = fetchRemoteSpots(client, 1_000);
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    await jest.advanceTimersByTimeAsync(1_000);
    await assertion;
  });
});

describe('offline cache', () => {
  it('saves and loads spots', async () => {
    const savedAt = new Date('2026-10-06T12:00:00.000Z');
    await expect(saveCachedSpots(SEED_SPOTS, savedAt)).resolves.toBe(true);
    await expect(loadCachedSpots()).resolves.toEqual({ version: 1, savedAt: savedAt.toISOString(), spots: SEED_SPOTS });
  });

  it('ignores a corrupted cache', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await kvStore.setItem(STORAGE_KEYS.spotsCache, JSON.stringify({ version: 1, savedAt: 'x', spots: 'nope' }));
    await expect(loadCachedSpots()).resolves.toBeNull();
    jest.restoreAllMocks();
  });
});
