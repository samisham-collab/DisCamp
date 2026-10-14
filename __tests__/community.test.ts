// Photos and check-ins against the in-memory server (migration 0006's rules).

import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  addPhoto,
  CHANGE_OPTIONS,
  CommunityError,
  CONFIRM_AGAIN_DAYS,
  confirmAgainAt,
  deletePhoto,
  listCheckins,
  listPhotos,
  MAX_CHECKIN_NOTE,
  myLastConfirmation,
  PHOTO_BUCKET,
  sendCheckin,
  toCommunityError,
} from '@/data/community';

import { ALEX, fakeBackend, NEWBIE, SAM, type FakeUser, type QueryResult } from '../test/fakeSupabase';
import { makeRow } from '../test/fixtures';

const SPOT = 'smoky-gardens';
const photo = { uri: 'file:///cache/photo.jpg', width: 1600, height: 1200 };
const bytes = async () => new Uint8Array([1, 2, 3]).buffer;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const silence = (level: 'warn' | 'error') => jest.spyOn(console, level).mockImplementation(() => undefined);

function server(user: FakeUser | null = SAM) {
  const backend = fakeBackend([makeRow({ id: SPOT, created_by: ALEX.id, added_by: 'Alex' })]);
  backend.auth.setUser(ALEX);
  backend.auth.setUser(user);
  return backend;
}

function add(backend: ReturnType<typeof server>, n: number, user: FakeUser = SAM) {
  return addPhoto(backend.client, { spotId: SPOT, id: id(n), userId: user.id, photo }, bytes);
}

/** Answers the next query with this. */
function answerNext(backend: ReturnType<typeof server>, result: QueryResult) {
  backend.intercept = () => {
    backend.intercept = null;
    return Promise.resolve(result);
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('photos', () => {
  it('uploads to your own folder, adds the photo and shows it to everyone', async () => {
    const backend = server();
    const added = await add(backend, 1);
    expect(added).toMatchObject({
      id: id(1),
      spotId: SPOT,
      path: `${SAM.id}/${id(1)}.jpg`,
      url: `https://fake.supabase.test/storage/v1/object/public/${PHOTO_BUCKET}/${SAM.id}/${id(1)}.jpg`,
      width: 1600,
      height: 1200,
      createdBy: SAM.id,
      addedBy: 'Sam',
    });
    expect(added.hidden).toBeUndefined();
    expect(backend.files.get(added.path)).toEqual({ owner: SAM.id, bytes: 3 });

    backend.auth.setUser(null);
    const seen = await listPhotos(backend.client, SPOT);
    expect(seen.map((p) => p.id)).toEqual([id(1)]);
  });

  it('carries on after a lost answer without adding the photo twice', async () => {
    const backend = server();
    await add(backend, 1);
    const again = await add(backend, 1);
    expect(again.id).toBe(id(1));
    expect(backend.photos.size).toBe(1);
    expect(backend.files.size).toBe(1);
  });

  it('removes the file when the photo is refused', async () => {
    const backend = server();
    for (const n of [1, 2, 3]) await add(backend, n);
    await expect(add(backend, 4)).rejects.toMatchObject({
      kind: 'limit',
      message: 'You can add up to 3 photos to a spot.',
    });
    expect(backend.files.has(`${SAM.id}/${id(4)}.jpg`)).toBe(false);
    expect(backend.storageCalls.at(-1)).toEqual({ op: 'remove', paths: [`${SAM.id}/${id(4)}.jpg`] });
  });

  it('still reports the refusal when the file cannot be cleaned up', async () => {
    const backend = server();
    backend.storageIntercept = (call) =>
      call.op === 'remove' ? Promise.reject(new Error('Network request failed')) : undefined;
    backend.spots.delete(SPOT);
    await expect(add(backend, 1)).rejects.toMatchObject({ kind: 'gone' });
  });

  it('asks the database why Storage turned the file away', async () => {
    const newbie = server(NEWBIE);
    await expect(add(newbie, 1, NEWBIE)).rejects.toMatchObject({
      kind: 'terms',
      message: 'Agree to the DisCamp community rules first.',
    });
    const banned = server();
    banned.banned.add(SAM.id);
    await expect(add(banned, 1)).rejects.toMatchObject({ kind: 'banned' });
    expect(newbie.photos.size + banned.photos.size).toBe(0);

    // Allowed to post, so Storage's daily limit (or a stale sign-in) said no.
    const busy = server();
    busy.storageIntercept = (call) =>
      call.op === 'upload'
        ? Promise.resolve({
            data: null,
            error: { message: 'new row violates row-level security policy', statusCode: '403' },
          })
        : undefined;
    await expect(add(busy, 1)).rejects.toMatchObject({
      kind: 'limit',
      message:
        "DisCamp couldn't take this photo. If you've added a lot today, try again tomorrow; if not, sign out and back in.",
    });
    busy.storageIntercept = () => Promise.resolve({ data: null, error: { message: 'Forbidden', statusCode: '403' } });
    busy.intercept = () => Promise.resolve({ data: null, error: { message: 'Failed to fetch' } });
    await expect(add(busy, 1)).rejects.toMatchObject({ kind: 'offline' });

    const offline = server();
    offline.storageIntercept = () => Promise.resolve({ data: null, error: { message: 'Network request failed' } });
    await expect(add(offline, 1)).rejects.toMatchObject({ kind: 'offline' });
  });

  it('keeps the file when the answer is lost, so trying again finishes the job', async () => {
    const backend = server();
    backend.intercept = (query) =>
      query.table === 'spot_photos' && query.op === 'insert'
        ? Promise.resolve({ data: null, error: { message: 'TypeError: Network request failed', code: '' } })
        : undefined;
    await expect(add(backend, 1)).rejects.toMatchObject({ kind: 'offline' });
    expect(backend.files.size).toBe(1);
    backend.intercept = null;
    await expect(add(backend, 1)).resolves.toMatchObject({ id: id(1) });
    expect(backend.photos.size).toBe(1);
  });

  it('turns the daily limit and a removed spot into plain messages', async () => {
    const backend = server();
    answerNext(backend, { data: null, error: { message: 'photo_limit_day', code: 'P0001' } });
    await expect(add(backend, 1)).rejects.toMatchObject({
      kind: 'limit',
      message: "You've added a lot of photos today. Try again tomorrow.",
    });
    backend.spots.delete(SPOT);
    await expect(add(backend, 2)).rejects.toMatchObject({ kind: 'gone' });
  });

  it("says so when the photo was added but can't be read back", async () => {
    const backend = server();
    backend.intercept = (query) =>
      query.table === 'spot_photos_api' ? Promise.resolve({ data: { id: 'nope' }, error: null }) : undefined;
    await expect(add(backend, 1)).rejects.toMatchObject({
      kind: 'server',
      message: 'Your photo was added, but it could not be shown. Reopen the spot.',
    });
    backend.intercept = (query) =>
      query.table === 'spot_photos_api'
        ? Promise.resolve({
            data: null,
            error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
          })
        : undefined;
    silence('error');
    await expect(add(backend, 1)).rejects.toMatchObject({
      kind: 'server',
      message: "Couldn't add the photo. Please try again.",
    });
  });

  it('gives up after the time limit', async () => {
    const backend = server();
    backend.storageIntercept = () => new Promise(() => undefined);
    await expect(
      addPhoto(backend.client, { spotId: SPOT, id: id(1), userId: SAM.id, photo }, bytes, 20),
    ).rejects.toMatchObject({ kind: 'timeout', message: 'The server took too long to answer. Try again.' });
  });

  it('lists photos oldest first, your hidden ones marked, and skips rows it cannot read', async () => {
    const backend = server();
    await add(backend, 1);
    await add(backend, 2);
    backend.photos.get(id(2))!.hidden = true;
    backend.photos.set('bad', { id: 'bad', spot_id: SPOT, path: 'x', width: 1, height: 1, created_by: SAM.id });
    const mine = await listPhotos(backend.client, SPOT);
    expect(mine.map((p) => [p.id, p.hidden])).toEqual([
      [id(1), undefined],
      [id(2), true],
    ]);
    backend.auth.setUser(ALEX);
    expect((await listPhotos(backend.client, SPOT)).map((p) => p.id)).toEqual([id(1)]);
  });

  it('leaves out names it has no profile for', async () => {
    const backend = server();
    await add(backend, 1);
    backend.profiles.delete(SAM.id);
    const [shown] = await listPhotos(backend.client, SPOT);
    expect(shown?.addedBy).toBeUndefined();
  });

  it('reports a failed or empty list', async () => {
    const backend = server();
    answerNext(backend, { data: null, error: { message: 'Failed to fetch' } });
    await expect(listPhotos(backend.client, SPOT)).rejects.toMatchObject({ kind: 'offline' });
    answerNext(backend, { data: null, error: null });
    await expect(listPhotos(backend.client, SPOT)).resolves.toEqual([]);
  });

  it('deletes your own photo and its file', async () => {
    const backend = server();
    const added = await add(backend, 1);
    await deletePhoto(backend.client, added);
    expect(backend.photos.size).toBe(0);
    expect(backend.files.size).toBe(0);
  });

  it("won't delete a photo under review or someone else's", async () => {
    const backend = server();
    const added = await add(backend, 1);
    backend.photos.get(added.id)!.hidden = true;
    await expect(deletePhoto(backend.client, added)).rejects.toMatchObject({ kind: 'invalid' });
    backend.photos.get(added.id)!.hidden = false;
    backend.auth.setUser(ALEX);
    await expect(deletePhoto(backend.client, added)).rejects.toMatchObject({ kind: 'invalid' });
    expect(backend.files.size).toBe(1);
  });

  it('still counts the photo deleted when its file stays behind', async () => {
    const backend = server();
    const added = await add(backend, 1);
    const warn = silence('warn');
    backend.storageIntercept = () => Promise.reject(new Error('Network request failed'));
    await deletePhoto(backend.client, added);
    expect(backend.photos.size).toBe(0);
    expect(warn).toHaveBeenCalled();

    backend.storageIntercept = null;
    const other = await add(backend, 2);
    backend.storageIntercept = () => Promise.resolve({ data: null, error: { message: 'Object not found' } });
    await deletePhoto(backend.client, other);
    expect(backend.photos.size).toBe(0);

    answerNext(backend, { data: null, error: { message: 'JWT expired', code: 'PGRST301' } });
    await expect(deletePhoto(backend.client, other)).rejects.toMatchObject({ kind: 'signed-out' });
  });
});

describe('check-ins', () => {
  it('confirms a spot and lists check-ins newest first', async () => {
    const backend = server();
    await sendCheckin(backend.client, SPOT, 'still_good');
    backend.auth.setUser(NEWBIE);
    backend.terms.set(NEWBIE.id, 99);
    await sendCheckin(backend.client, SPOT, 'road_damage', '  Washed out a mile in.  ');
    const list = await listCheckins(backend.client, SPOT);
    expect(list).toEqual([
      expect.objectContaining({
        kind: 'road_damage',
        camperId: NEWBIE.id,
        camperName: 'Robin',
        note: 'Washed out a mile in.',
      }),
      expect.objectContaining({ kind: 'still_good', camperId: SAM.id, camperName: 'Sam' }),
    ]);
    expect(list[1]?.note).toBeUndefined();
    expect(backend.spots.get(SPOT)?.report_count).toBe(5 + 2);
    expect(backend.writes('checkins').map((q) => q.payload)).toEqual([
      { spot_id: SPOT, kind: 'still_good' },
      { spot_id: SPOT, kind: 'road_damage', note: 'Washed out a mile in.' },
    ]);
  });

  it('trims long notes and skips rows it cannot read', async () => {
    const backend = server();
    await sendCheckin(backend.client, SPOT, 'other', 'x'.repeat(MAX_CHECKIN_NOTE + 50));
    expect(String(backend.writes('checkins')[0]?.payload?.note)).toHaveLength(MAX_CHECKIN_NOTE);
    backend.checkins.push({ id: 'bad', spot_id: SPOT, camper_id: null, kind: 'nope', note: null, created_at: 'x' });
    backend.checkins.push({
      id: 9,
      spot_id: SPOT,
      camper_id: null,
      kind: 'trash',
      note: '  ',
      created_at: '2026-10-01T00:00:00Z',
    });
    backend.profiles.delete(SAM.id);
    const list = await listCheckins(backend.client, SPOT);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ id: 9, spotId: SPOT, kind: 'trash', createdAt: '2026-10-01T00:00:00.000Z' });
    answerNext(backend, { data: null, error: null });
    await expect(listCheckins(backend.client, SPOT)).resolves.toEqual([]);
  });

  it('explains each refusal', async () => {
    const backend = server();
    await sendCheckin(backend.client, SPOT, 'still_good');
    await expect(sendCheckin(backend.client, SPOT, 'still_good')).rejects.toMatchObject({
      kind: 'already',
      message: "You've confirmed this spot in the last 30 days. Thanks!",
    });
    await sendCheckin(backend.client, SPOT, 'trash');
    await expect(sendCheckin(backend.client, SPOT, 'trash')).rejects.toMatchObject({
      kind: 'already',
      message: "You've already said that about this spot today. Thanks!",
    });
    await expect(sendCheckin(backend.client, SPOT, 'other', 'what the fuck')).rejects.toMatchObject({
      kind: 'invalid',
    });
    backend.spots.get(SPOT)!.created_by = SAM.id;
    await expect(sendCheckin(backend.client, SPOT, 'closed')).resolves.toBeUndefined();
    await expect(sendCheckin(backend.client, SPOT, 'still_good')).rejects.toMatchObject({
      kind: 'invalid',
      message: 'You added this spot, so other campers confirm it.',
    });
    backend.spots.get(SPOT)!.created_by = ALEX.id;
    await expect(sendCheckin(backend.client, 'gone', 'trash')).rejects.toMatchObject({
      kind: 'gone',
      message: 'That spot is no longer on DisCamp.',
    });
    answerNext(backend, { data: null, error: { message: 'checkin_limit', code: 'P0001' } });
    await expect(sendCheckin(backend.client, SPOT, 'trash')).rejects.toMatchObject({ kind: 'limit' });
    answerNext(backend, { data: null, error: { message: 'not_signed_in', code: 'P0001' } });
    await expect(sendCheckin(backend.client, SPOT, 'trash')).rejects.toMatchObject({ kind: 'signed-out' });

    backend.banned.add(SAM.id);
    await expect(sendCheckin(backend.client, SPOT, 'trash')).rejects.toMatchObject({ kind: 'banned' });
    backend.auth.setUser(NEWBIE);
    await expect(sendCheckin(backend.client, SPOT, 'trash')).rejects.toMatchObject({
      kind: 'terms',
      message: 'Agree to the DisCamp community rules first.',
    });
    backend.auth.setUser(null);
    await expect(sendCheckin(backend.client, SPOT, 'trash')).rejects.toMatchObject({ kind: 'signed-out' });
  });

  it('turns failed loads into plain messages', async () => {
    const backend = server();
    answerNext(backend, { data: null, error: { message: 'Load failed' } });
    await expect(listCheckins(backend.client, SPOT)).rejects.toMatchObject({ kind: 'offline' });
    backend.intercept = () => new Promise(() => undefined);
    await expect(listCheckins(backend.client, SPOT, 20)).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('Still good, once a month', () => {
  it('finds your latest "Still good", and when you can confirm again', async () => {
    const backend = server();
    expect(await myLastConfirmation(backend.client, SPOT, SAM.id)).toBeNull();
    await sendCheckin(backend.client, SPOT, 'still_good');
    const mine = await myLastConfirmation(backend.client, SPOT, SAM.id);
    expect(mine).toEqual({ at: expect.any(String), withdrawn: false });
    const again = confirmAgainAt(mine);
    expect(again?.getTime()).toBe(Date.parse(mine!.at) + CONFIRM_AGAIN_DAYS * 86_400_000);
    expect(confirmAgainAt(mine, new Date(Date.parse(mine!.at) + 31 * 86_400_000))).toBeNull();
    expect(confirmAgainAt(null)).toBeNull();
    expect(confirmAgainAt({ at: 'nope', withdrawn: false })).toBeNull();
  });

  it('takes it back when you report a change, and only you see it then', async () => {
    const backend = server();
    await sendCheckin(backend.client, SPOT, 'still_good');
    backend.auth.setUser(NEWBIE);
    backend.terms.set(NEWBIE.id, 99);
    await sendCheckin(backend.client, SPOT, 'still_good');
    expect(backend.spots.get(SPOT)?.verified).toBe(true);

    backend.auth.setUser(SAM);
    await sendCheckin(backend.client, SPOT, 'gate_closed');
    expect(await myLastConfirmation(backend.client, SPOT, SAM.id)).toEqual({ at: expect.any(String), withdrawn: true });
    const mineList = await listCheckins(backend.client, SPOT);
    expect(mineList.map((c) => [c.kind, c.withdrawn])).toEqual([
      ['gate_closed', undefined],
      ['still_good', undefined],
      ['still_good', true],
    ]);
    // Two confirmations needed; one is left, so the spot isn't confirmed any more.
    expect(backend.spots.get(SPOT)?.verified).toBe(false);

    backend.auth.setUser(ALEX);
    expect((await listCheckins(backend.client, SPOT)).map((c) => c.kind)).toEqual(['gate_closed', 'still_good']);
  });

  it('reports a failed lookup, and ignores rows it cannot read', async () => {
    const backend = server();
    answerNext(backend, { data: null, error: { message: 'Failed to fetch' } });
    await expect(myLastConfirmation(backend.client, SPOT, SAM.id)).rejects.toMatchObject({ kind: 'offline' });
    answerNext(backend, { data: [{ created_at: 5 }], error: null });
    await expect(myLastConfirmation(backend.client, SPOT, SAM.id)).resolves.toBeNull();
    answerNext(backend, { data: null, error: null });
    await expect(myLastConfirmation(backend.client, SPOT, SAM.id)).resolves.toBeNull();
  });
});

describe('toCommunityError', () => {
  it('keeps its own errors and reads anything else', () => {
    const own = new CommunityError('x', 'limit');
    expect(toCommunityError(own, 'Nope.')).toBe(own);
    expect(toCommunityError({ message: 'x', code: '23503' }, 'Nope.').kind).toBe('gone');
    expect(toCommunityError({ message: 'new row violates row-level security policy' }, 'Nope.').kind).toBe(
      'signed-out',
    );
    const error = silence('error');
    expect(toCommunityError('weird', 'Nope.')).toMatchObject({ kind: 'server', message: 'Nope. Please try again.' });
    expect(toCommunityError(null, 'Nope.').kind).toBe('server');
    expect(error).toHaveBeenCalled();
  });

  it('offers every kind of change', () => {
    expect(CHANGE_OPTIONS.map((o) => o.value)).toEqual(['road_damage', 'gate_closed', 'trash', 'closed', 'other']);
  });
});
