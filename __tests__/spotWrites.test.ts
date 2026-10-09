import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { createSpot, deleteSpot, SpotWriteError, toSpotRow, toWriteError, updateSpot } from '@/data/spotWrites';
import { checkDraft, emptyDraft, type SpotInput } from '@/lib/spotDraft';

import { ALEX, fakeBackend, SAM } from '../test/fakeSupabase';
import { makeRow } from '../test/fixtures';

const input: SpotInput = checkDraft({
  ...emptyDraft(),
  name: 'Bluff Pull-off',
  landManager: 'National Forest',
  coordinates: '46.6530001, -121.6140004',
  clearanceTier: 3,
  feeKind: 'free',
  amenities: 'Fire ring',
}).input!;

let ids = 0;
/** A fresh UUID for each new spot, as the app picks them. */
const newId = () => `00000000-0000-4000-8000-${String((ids += 1)).padStart(12, '0')}`;

const silence = (level: 'warn' | 'error') => jest.spyOn(console, level).mockImplementation(() => undefined);

describe('spot rows for the database', () => {
  it('sends only the fields campers may write, with the point as PostGIS text', () => {
    const row = toSpotRow(input);
    expect(row.location).toBe('SRID=4326;POINT(-121.614 46.653)');
    expect(row).toMatchObject({
      name: 'Bluff Pull-off',
      clearance_tier: 3,
      nightly_fee_usd: 0,
      amenities: ['Fire ring'],
    });
    for (const owned of ['id', 'verified', 'report_count', 'sources', 'created_by', 'created_at']) {
      expect(row).not.toHaveProperty(owned);
    }
    expect(row).toMatchObject({ cost_notes: null, directions: null, phone: null });
  });
});

describe('saving spots', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('adds a spot and reads it back the way the map shows it', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    const spot = await createSpot(backend.client, input, newId());
    expect(spot).toMatchObject({
      name: 'Bluff Pull-off',
      latitude: 46.653,
      longitude: -121.614,
      createdBy: SAM.id,
      addedBy: 'Sam',
      createdAt: '2026-10-07T12:00:00.123Z',
      verified: false,
    });
    const [insert] = backend.writes('spots', 'insert');
    expect(insert?.payload).toEqual({ id: spot.id, ...toSpotRow(input) });
  });

  it('adds a spot only once when a try is repeated, keeping the newest details', async () => {
    const backend = fakeBackend([]);
    backend.auth.setUser(SAM);
    const id = newId();
    // The first try reached the server, but its answer was lost.
    await createSpot(backend.client, input, id);
    const again = await createSpot(backend.client, { ...input, name: 'Bluff Pull-off (fixed)' }, id);
    expect(again).toMatchObject({ id, name: 'Bluff Pull-off (fixed)' });
    expect(backend.spots.size).toBe(1);
    expect(backend.writes('spots', 'update')).toHaveLength(1);

    // If bringing it up to date fails, say so.
    const warn = silence('warn');
    backend.intercept = (query) =>
      query.op === 'update' ? Promise.resolve({ data: null, error: { message: 'bad', code: '23514' } }) : undefined;
    await expect(createSpot(backend.client, input, id)).rejects.toMatchObject({ kind: 'invalid' });
    expect(warn).toHaveBeenCalled();
  });

  it('edits your own spot, and refuses someone else’s', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    const mine = await createSpot(backend.client, input, newId());
    const edited = await updateSpot(backend.client, mine.id, { ...input, name: 'Bluff Flats' });
    expect(edited.name).toBe('Bluff Flats');

    backend.auth.setUser(ALEX);
    await expect(updateSpot(backend.client, mine.id, input)).rejects.toMatchObject({
      kind: 'not-allowed',
      message: 'You can only change spots you added.',
    });
  });

  it('deletes your own spot until someone reports on it', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    const first = await createSpot(backend.client, input, newId());
    await deleteSpot(backend.client, first.id);
    expect(backend.spots.has(first.id)).toBe(false);

    const second = await createSpot(backend.client, input, newId());
    backend.spots.get(second.id)!.report_count = 2;
    await expect(deleteSpot(backend.client, second.id)).rejects.toMatchObject({ kind: 'not-allowed' });
  });

  it('explains what went wrong', async () => {
    const error = silence('error');
    const warn = silence('warn');
    const backend = fakeBackend();
    // Signed out: the database answers "permission denied".
    await expect(createSpot(backend.client, input, newId())).rejects.toMatchObject({ kind: 'signed-out' });

    backend.auth.setUser(SAM);
    const answers: [Record<string, unknown>, string][] = [
      [{ message: 'daily_limit', code: 'P0001' }, 'limit'],
      [{ message: 'TypeError: Network request failed' }, 'offline'],
      [{ message: 'JWT expired', code: 'PGRST301' }, 'signed-out'],
      [{ message: 'new row violates check constraint', code: '23514' }, 'invalid'],
      [{ message: 'something odd', code: 'XX000' }, 'server'],
    ];
    for (const [answer, kind] of answers) {
      backend.intercept = () => Promise.resolve({ data: null, error: answer as { message: string } });
      await expect(createSpot(backend.client, input, newId())).rejects.toMatchObject({ kind });
    }
    expect(error).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('gives up on a slow server', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    backend.intercept = (query) =>
      new Promise((resolve) => {
        query.signal?.addEventListener('abort', () =>
          resolve({ data: null, error: { message: 'AbortError: The operation was aborted' } }),
        );
      });
    await expect(createSpot(backend.client, input, newId(), 5)).rejects.toMatchObject({ kind: 'timeout' });
    await expect(deleteSpot(backend.client, 'x', 5)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('copes with a server that answers strangely', async () => {
    const warn = silence('warn');
    const error = silence('error');
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    // Saved, but the server can't find it to send back.
    backend.intercept = (query) =>
      query.op === 'insert' ? Promise.resolve({ data: { id: 'whatever' }, error: null }) : undefined;
    await expect(createSpot(backend.client, input, newId())).rejects.toMatchObject({ kind: 'server' });

    backend.intercept = (query) =>
      query.table === 'spots_api'
        ? Promise.resolve({ data: makeRow({ id: 'x', site_type: 'hotel' }), error: null })
        : undefined;
    await expect(createSpot(backend.client, input, newId())).rejects.toMatchObject({
      kind: 'server',
      message: 'Your spot was saved, but it could not be loaded. Tap Add spot again to open it.',
    });
    expect(warn).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('turns any thrown value into a write error', () => {
    const existing = new SpotWriteError('x', 'limit');
    expect(toWriteError(existing, 'save')).toBe(existing);
    expect(toWriteError(new Error('Failed to fetch'), 'delete').message).toBe(
      "You're offline. Try again when you have signal.",
    );
    const error = silence('error');
    expect(toWriteError('weird', 'delete')).toMatchObject({
      kind: 'server',
      message: "Couldn't delete the spot. Please try again.",
    });
    expect(error).toHaveBeenCalled();
  });
});
