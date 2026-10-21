// Staying on Supabase's free plan: whether photos or posts are paused, the
// moderators' usage numbers, and how they read.

import { describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';

import {
  fetchAppStatus,
  fetchFreePlanUsage,
  formatBytes,
  OPEN_STATUS,
  percentOf,
  POSTING_PAUSED_MESSAGE,
  STATUS_MAX_AGE_MS,
  useAppStatus,
} from '@/data/appStatus';
import { toCommunityError } from '@/data/community';
import { createSpot, toWriteError } from '@/data/spotWrites';
import { checkDraft, emptyDraft } from '@/lib/spotDraft';

import { fakeBackend, SAM } from '../test/fakeSupabase';

describe('app status', () => {
  it('says whether photos or posts are paused, for anyone', async () => {
    const backend = fakeBackend();
    expect(await fetchAppStatus(backend.client)).toEqual(OPEN_STATUS);
    backend.paused.photos = true;
    expect(await fetchAppStatus(backend.client)).toEqual({ photosPaused: true, postingPaused: false, level: 'paused' });
    backend.paused.posting = true;
    expect(await fetchAppStatus(backend.client)).toEqual({ photosPaused: true, postingPaused: true, level: 'paused' });
  });

  it("answers null when it can't tell, quietly", async () => {
    const backend = fakeBackend();
    backend.intercept = (query) =>
      query.table === 'rpc:app_status' ? Promise.resolve({ data: { level: 'full' }, error: null }) : undefined;
    expect(await fetchAppStatus(backend.client)).toBeNull();
    backend.intercept = () => Promise.resolve({ data: null, error: { message: 'Network request failed' } });
    expect(await fetchAppStatus(backend.client)).toBeNull();
  });

  it('asks at most every 10 minutes per client', async () => {
    const backend = fakeBackend();
    backend.paused.photos = true;
    const first = renderHook(() => useAppStatus(backend.client));
    expect(first.result.current).toEqual(OPEN_STATUS);
    await waitFor(() => expect(first.result.current.photosPaused).toBe(true));
    const asked = () => backend.queries.filter((q) => q.table === 'rpc:app_status').length;
    expect(asked()).toBe(1);

    // Another screen soon after: the same answer, without asking.
    const second = renderHook(() => useAppStatus(backend.client));
    expect(second.result.current.photosPaused).toBe(true);
    expect(asked()).toBe(1);

    // Later: asks again, and hears the pause lifted.
    backend.paused.photos = false;
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + STATUS_MAX_AGE_MS + 1);
    const later = renderHook(() => useAppStatus(backend.client));
    await waitFor(() => expect(later.result.current.photosPaused).toBe(false));
    expect(asked()).toBe(2);
    jest.restoreAllMocks();

    // No client (signed out of the server entirely): nothing paused, nothing asked.
    expect(renderHook(() => useAppStatus(null)).result.current).toEqual(OPEN_STATUS);
  });

  it('explains a refused post or photo', async () => {
    expect(toCommunityError({ message: 'photos_paused' }, 'x').message).toMatch(/New photos are paused/);
    expect(toCommunityError({ message: 'posting_paused' }, 'x').message).toBe(POSTING_PAUSED_MESSAGE);
    expect(toWriteError({ message: 'posting_paused' }, 'save').message).toBe(POSTING_PAUSED_MESSAGE);

    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    backend.paused.posting = true;
    const input = checkDraft({
      ...emptyDraft(),
      name: 'Paused Flat',
      landManager: 'BLM',
      coordinates: '39.19, -101.76',
      clearanceTier: 3,
      feeKind: 'free',
    }).input;
    if (!input) throw new Error('The draft should be fine');
    await expect(createSpot(backend.client, input, '00000000-0000-4000-8000-0000000000aa')).rejects.toThrow(
      POSTING_PAUSED_MESSAGE,
    );
  });
});

describe('free plan usage', () => {
  it('is for moderators', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    expect(await fetchFreePlanUsage(backend.client)).toBeNull();
    backend.moderators.add(SAM.id);
    const usage = await fetchFreePlanUsage(backend.client);
    expect(usage).toMatchObject({
      storageBytes: 140 * 1024 * 1024,
      storageLimitBytes: 1024 * 1024 * 1024,
      databaseBytes: 30 * 1024 * 1024,
      level: 'ok',
      activeCampers: 23,
    });
    expect(usage?.monthAgo).toBeUndefined();

    backend.usage = {
      ...backend.usage,
      month_ago: { day: '2026-09-21', database_bytes: 20 * 1024 * 1024, storage_bytes: 100 * 1024 * 1024 },
    };
    expect((await fetchFreePlanUsage(backend.client))?.monthAgo).toEqual({
      day: '2026-09-21',
      databaseBytes: 20 * 1024 * 1024,
      storageBytes: 100 * 1024 * 1024,
    });
  });

  it('reads sizes the way people say them', () => {
    expect(formatBytes(512)).toBe('512 bytes');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(140 * 1024 * 1024)).toBe('140 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    expect(formatBytes(2.25 * 1024 * 1024 * 1024)).toBe('2.3 GB');
    expect(percentOf(140, 1024)).toBe(13);
    expect(percentOf(5, 0)).toBe(0);
  });
});
