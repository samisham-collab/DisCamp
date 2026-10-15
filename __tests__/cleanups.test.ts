// Cleanups, reviews and Embers against the in-memory server (migration 0008's rules).

import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  amModerator,
  approveCleanup,
  CLEANUP_KIND_OPTIONS,
  CLEANUP_SIZE_OPTIONS,
  deleteCleanup,
  getCleanup,
  listCleanups,
  listEmbers,
  myEmbers,
  myTries,
  postCleanup,
  rejectCleanup,
  reviewQueue,
  sendCleanup,
  toCleanup,
} from '@/data/cleanups';
import { TERMS_VERSION } from '@/config';
import { type CommunityError, toCommunityError } from '@/data/community';

import { ALEX, fakeBackend, NEWBIE, SAM, type FakeUser, type QueryResult } from '../test/fakeSupabase';
import { makeRow } from '../test/fixtures';

const photo = { uri: 'file:///cache/photo.jpg', width: 1600, height: 1200 };
const bytes = async () => new Uint8Array([1, 2, 3]).buffer;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const HERE = { latitude: 39.19, longitude: -101.76 };

function server(user: FakeUser | null = SAM) {
  const backend = fakeBackend([makeRow()]);
  backend.auth.setUser(ALEX);
  backend.auth.setUser(user);
  return backend;
}

function post(backend: ReturnType<typeof server>, n: number, extra: { spotId?: string; note?: string } = {}) {
  return postCleanup(
    backend.client,
    { id: id(n), userId: SAM.id, photo, at: HERE, kind: 'litter', size: 'small', ...extra },
    bytes,
  );
}

function send(backend: ReturnType<typeof server>, task: string, n: number, user: FakeUser, at = HERE) {
  return sendCleanup(
    backend.client,
    {
      id: id(n),
      haulId: id(n + 1),
      userId: user.id,
      taskId: task,
      after: photo,
      haul: photo,
      at: { ...at, accuracy: 6.4 },
    },
    bytes,
  );
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

describe('posting a cleanup', () => {
  it('uploads the before photo, posts it where the camper stands, and reads it back', async () => {
    const backend = server();
    const task = await post(backend, 1, { spotId: 'row-spot', note: '  Cans ' });
    expect(task).toMatchObject({
      id: id(1),
      kind: 'litter',
      size: 'small',
      status: 'open',
      note: 'Cans',
      createdBy: SAM.id,
      postedBy: 'Sam',
      spotId: 'row-spot',
      spotName: 'Row spot',
      latitude: 39.19,
      longitude: -101.76,
    });
    expect(task.beforeUrl).toMatch(new RegExp(`/spot-photos/${SAM.id}/${id(1)}\\.jpg$`));
    expect(backend.writes('cleanup_tasks', 'insert')[0]?.payload).toMatchObject({
      location: 'SRID=4326;POINT(-101.76 39.19)',
      before_path: `${SAM.id}/${id(1)}.jpg`,
    });
    // Anyone can read it.
    const visitor = server(null);
    visitor.cleanups.set(id(1), { ...backend.cleanups.get(id(1)) });
    expect(await listCleanups(visitor.client)).toEqual([expect.objectContaining({ id: id(1) })]);
    expect(await getCleanup(visitor.client, id(9))).toBeNull();
  });

  it('carries on after a lost answer', async () => {
    const backend = server();
    await post(backend, 1);
    const again = await post(backend, 1);
    expect(again.id).toBe(id(1));
    expect(backend.cleanups.size).toBe(1);
  });

  it('removes the photo when the server refuses the cleanup', async () => {
    const backend = server();
    await post(backend, 1);
    await expect(post(backend, 2)).rejects.toMatchObject({ kind: 'already' });
    expect(backend.files.has(`${SAM.id}/${id(2)}.jpg`)).toBe(false);
  });

  it('says why when Storage refuses the photo', async () => {
    const backend = server();
    backend.banned.add(SAM.id);
    await expect(post(backend, 1)).rejects.toMatchObject({ kind: 'banned' });
  });

  it('says so when it was posted but can’t be read back', async () => {
    const backend = server();
    backend.intercept = (query) =>
      query.table === 'cleanup_tasks_api' ? Promise.resolve({ data: { id: 'bad' }, error: null }) : undefined;
    await expect(post(backend, 1)).rejects.toMatchObject({
      kind: 'server',
      message: 'Your cleanup was posted, but it could not be shown. Reopen Cleanups.',
    });
  });
});

describe('the list', () => {
  it('skips rows that don’t parse', async () => {
    const backend = server();
    await post(backend, 1);
    answerNext(backend, {
      data: [{ id: 'nope' }, ...(await listCleanups(backend.client)).map(() => null)],
      error: null,
    });
    expect(await listCleanups(backend.client)).toEqual([]);
    answerNext(backend, { data: null, error: null });
    expect(await listCleanups(backend.client)).toEqual([]);
  });

  it('turns failures into messages, without logging an error', async () => {
    const backend = server();
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    answerNext(backend, { data: null, error: { message: 'Failed to fetch' } });
    await expect(listCleanups(backend.client)).rejects.toMatchObject({ kind: 'offline' });
    answerNext(backend, { data: null, error: { message: 'boom', code: 'XX000' } });
    await expect(listCleanups(backend.client)).rejects.toMatchObject({ kind: 'server' });
    expect(info).toHaveBeenCalled();
    backend.intercept = () => new Promise(() => undefined);
    await expect(listCleanups(backend.client, 5)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('reads every field of a done cleanup', () => {
    const backend = server();
    const done = toCleanup(backend.client, {
      id: id(1),
      latitude: 39.19,
      longitude: -101.76,
      kind: 'dumping',
      size: 'large',
      note: null,
      status: 'done',
      before_path: `${ALEX.id}/${id(1)}.jpg`,
      created_by: null,
      posted_by: null,
      created_at: '2026-10-10 12:00:00+00',
      spot_id: null,
      spot_name: null,
      hidden: true,
      done_at: '2026-10-12 12:00:00+00',
      cleaned_by_id: SAM.id,
      cleaned_by: ' Sam ',
      after_path: `${SAM.id}/${id(2)}.jpg`,
      haul_path: `${SAM.id}/${id(3)}.jpg`,
    });
    expect(done).toMatchObject({ hidden: true, cleanedBy: 'Sam', doneAt: '2026-10-12T12:00:00.000Z' });
    expect(done?.afterUrl).toMatch(/\.jpg$/);
    expect(done?.haulUrl).toMatch(/\.jpg$/);
    expect(done?.createdBy).toBeUndefined();
  });

  it('offers every kind and size', () => {
    expect(CLEANUP_KIND_OPTIONS.map((o) => o.value)).toEqual(['litter', 'fire_ring', 'dumping', 'other']);
    expect(CLEANUP_SIZE_OPTIONS.map((o) => o.label)).toEqual([
      'Small: fits in one bag',
      'Medium: 2 to 4 bags',
      'Large: 5 or more bags, or bulky items',
    ]);
  });
});

describe('deleting', () => {
  it('deletes your own untouched cleanup and its photo, and says when it can’t', async () => {
    const backend = server();
    const task = await post(backend, 1);
    await deleteCleanup(backend.client, task);
    expect(backend.cleanups.size).toBe(0);
    expect(backend.files.size).toBe(0);

    const kept = await post(backend, 2);
    backend.flags.push({ reporter: ALEX.id, taskId: kept.id, reason: 'fake', status: 'open' });
    await expect(deleteCleanup(backend.client, kept)).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('notes a photo file it couldn’t remove', async () => {
    const backend = server();
    const task = await post(backend, 1);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    backend.storageIntercept = () => Promise.resolve({ data: null, error: { message: 'gone' } });
    await deleteCleanup(backend.client, task);
    expect(warn).toHaveBeenCalled();
  });
});

describe('sending a cleanup', () => {
  it('uploads both photos and sends it for review; tries come back for the camper', async () => {
    const backend = server(ALEX);
    backend.auth.setUser(SAM);
    const task = await post(backend, 1);
    backend.auth.setUser(ALEX);
    await send(backend, task.id, 10, ALEX);
    expect(backend.completions[0]).toMatchObject({
      task_id: task.id,
      after_path: `${ALEX.id}/${id(10)}.jpg`,
      haul_path: `${ALEX.id}/${id(11)}.jpg`,
      accuracy_m: 6,
      status: 'pending',
    });
    expect(await myTries(backend.client, task.id, ALEX.id)).toEqual([
      { id: id(10), status: 'pending', createdAt: expect.any(String) },
    ]);
    // A second camper is told it's waiting.
    backend.auth.setUser(NEWBIE);
    backend.terms.set(NEWBIE.id, TERMS_VERSION);
    await expect(send(backend, task.id, 20, NEWBIE)).rejects.toMatchObject({ kind: 'already' });
    expect(backend.files.has(`${NEWBIE.id}/${id(20)}.jpg`)).toBe(false);
  });

  it('carries on after a lost answer, and refuses one sent from too far', async () => {
    const backend = server();
    const task = await post(backend, 1);
    await expect(send(backend, task.id, 10, SAM, { latitude: 39.21, longitude: -101.76 })).rejects.toMatchObject({
      kind: 'invalid',
      message: "Take the after photo within 150 m of the cleanup's pin, then try again.",
    });
    await send(backend, task.id, 12, SAM);
    await send(backend, task.id, 12, SAM);
    expect(backend.completions).toHaveLength(1);
  });

  it('shows a review note, and skips tries that don’t parse', async () => {
    const backend = server();
    answerNext(backend, {
      data: [
        { id: id(1), status: 'rejected', review_note: ' Not clean ', created_at: '2026-10-10 12:00:00+00' },
        { id: 'bad' },
      ],
      error: null,
    });
    expect(await myTries(backend.client, id(9), SAM.id)).toEqual([
      { id: id(1), status: 'rejected', reviewNote: 'Not clean', createdAt: '2026-10-10T12:00:00.000Z' },
    ]);
    answerNext(backend, { data: null, error: null });
    expect(await myTries(backend.client, id(9), SAM.id)).toEqual([]);
  });

  it('removes the after photo when Storage refuses the haul shot', async () => {
    const backend = server();
    const task = await post(backend, 1);
    backend.storageIntercept = (call) =>
      call.op === 'upload' && call.paths[0]?.endsWith(`${id(41)}.jpg`)
        ? Promise.resolve({
            data: null,
            error: { message: 'new row violates row-level security policy', statusCode: '403' },
          })
        : undefined;
    await expect(send(backend, task.id, 40, SAM)).rejects.toMatchObject({ kind: 'limit' });
    expect(backend.files.has(`${SAM.id}/${id(40)}.jpg`)).toBe(false);
    expect(backend.completions).toHaveLength(0);
  });

  it('won’t take a photo that’s already on DisCamp', async () => {
    const backend = server();
    const task = await post(backend, 1);
    // The before photo as the after photo.
    await expect(
      sendCleanup(
        backend.client,
        { id: task.id, haulId: id(51), userId: SAM.id, taskId: task.id, after: photo, haul: photo, at: HERE },
        bytes,
      ),
    ).rejects.toMatchObject({ message: 'That photo is already on DisCamp. Take a new one.' });
  });

  it('leaves out an accuracy the phone didn’t give', async () => {
    const backend = server();
    const task = await post(backend, 1);
    await sendCleanup(
      backend.client,
      {
        id: id(30),
        haulId: id(31),
        userId: SAM.id,
        taskId: task.id,
        after: photo,
        haul: photo,
        at: { ...HERE, accuracy: null },
      },
      bytes,
    );
    expect(backend.writes('cleanup_completions', 'insert').at(-1)?.payload).not.toHaveProperty('accuracy_m');
  });
});

describe('review', () => {
  async function waiting() {
    const backend = server(ALEX);
    const task = await postCleanup(
      backend.client,
      { id: id(1), userId: ALEX.id, photo, at: HERE, kind: 'litter', size: 'small' },
      bytes,
    );
    backend.auth.setUser(SAM);
    await send(backend, task.id, 10, SAM);
    return backend;
  }

  it('is for moderators only', async () => {
    const backend = await waiting();
    expect(await amModerator(backend.client)).toBe(false);
    await expect(reviewQueue(backend.client)).rejects.toMatchObject({ kind: 'invalid' });
    await expect(approveCleanup(backend.client, id(10), 'small')).rejects.toMatchObject({ kind: 'invalid' });
    // Can't tell.
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    answerNext(backend, { data: null, error: { message: 'Failed to fetch' } });
    expect(await amModerator(backend.client)).toBeNull();
  });

  it('lists what waits, and approves or sends back', async () => {
    const backend = await waiting();
    backend.moderators.add(SAM.id);
    expect(await amModerator(backend.client)).toBe(true);
    const [item] = await reviewQueue(backend.client);
    expect(item).toMatchObject({
      completionId: id(10),
      kind: 'litter',
      taskSize: 'small',
      camperName: 'Sam',
      postedByName: 'Alex',
      distanceM: 0,
      accuracyM: 6,
      tries: 1,
      camperApproved: 0,
    });
    await expect(rejectCleanup(backend.client, id(10), '  ')).rejects.toMatchObject({
      message: 'Say why, so the camper can fix it.',
    });
    await rejectCleanup(backend.client, id(10), 'Not clean yet');
    await expect(approveCleanup(backend.client, id(10), 'small')).rejects.toMatchObject({ kind: 'already' });
    await send(backend, id(1), 20, SAM);
    await approveCleanup(backend.client, id(20), 'large');
    expect(backend.embers.map((e) => e.amount)).toEqual([150, 10]);
    await expect(approveCleanup(backend.client, id(99), 'large')).rejects.toMatchObject({ kind: 'gone' });
  });

  it('skips (and notes) a row it can’t read', async () => {
    const backend = await waiting();
    backend.moderators.add(SAM.id);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    answerNext(backend, { data: [{ completion_id: 'x' }], error: null });
    expect(await reviewQueue(backend.client)).toEqual([]);
    expect(warn).toHaveBeenCalled();
    answerNext(backend, { data: null, error: null });
    expect(await reviewQueue(backend.client)).toEqual([]);
  });

  it('reads a row with nothing optional', async () => {
    const backend = await waiting();
    backend.moderators.add(SAM.id);
    const [row] = (await backend.client.rpc('cleanup_review_queue')).data as Record<string, unknown>[];
    answerNext(backend, {
      data: [
        {
          ...row,
          task_note: null,
          note: null,
          camper_id: null,
          camper_name: null,
          camper_joined: null,
          posted_by: null,
          posted_by_name: null,
          spot_id: null,
          spot_name: null,
          distance_m: null,
          accuracy_m: null,
          camper_approved: '3',
          tries: '2',
        },
      ],
      error: null,
    });
    const [item] = await reviewQueue(backend.client);
    expect(item).toMatchObject({ camperApproved: 3, tries: 2, distanceM: null });
    expect(item?.camperName).toBeUndefined();
  });
});

describe('Embers', () => {
  it('reads the summary and the ledger', async () => {
    const backend = server();
    backend.embers.push(
      {
        id: 1,
        camper_id: SAM.id,
        reason: 'photo',
        amount: 5,
        full_amount: 5,
        spot_id: 'row-spot',
        spot_name: 'Row spot',
        created_at: '2026-10-10 12:00:00+00',
      },
      {
        id: 2,
        camper_id: SAM.id,
        reason: 'mystery',
        amount: 5,
        full_amount: 5,
        spot_id: null,
        spot_name: null,
        created_at: '2026-10-10 12:00:00+00',
      },
    );
    // Earned on another day: none today.
    expect(await myEmbers(backend.client)).toEqual({ total: 10, today: 0, dailyLimit: 300 });
    expect(await listEmbers(backend.client)).toEqual([
      {
        id: 1,
        reason: 'photo',
        amount: 5,
        fullAmount: 5,
        spotId: 'row-spot',
        spotName: 'Row spot',
        createdAt: '2026-10-10T12:00:00.000Z',
      },
    ]);
    answerNext(backend, { data: [{ total: 'lots' }], error: null });
    expect(await myEmbers(backend.client)).toEqual({ total: 0, today: 0, dailyLimit: null });
    answerNext(backend, { data: null, error: null });
    expect(await listEmbers(backend.client)).toEqual([]);
  });

  it('needs a signed-in camper', async () => {
    const backend = server(null);
    await expect(myEmbers(backend.client)).rejects.toMatchObject({ kind: 'signed-out' });
    await expect(listEmbers(backend.client)).rejects.toMatchObject({ kind: 'signed-out' });
  });
});

describe('messages', () => {
  it('explains each refusal about cleanups', () => {
    const cases: [string, CommunityError['kind']][] = [
      ['spot_too_far', 'invalid'],
      ['cleanup_nearby', 'already'],
      ['cleanup_limit', 'limit'],
      ['cleanup_gone', 'gone'],
      ['review_gone', 'gone'],
      ['cleanup_done', 'already'],
      ['cleanup_in_review', 'already'],
      ['cleanup_too_far', 'invalid'],
      ['cleanup_tries', 'limit'],
      ['not_moderator', 'invalid'],
      ['review_done', 'already'],
      ['reason_needed', 'invalid'],
      ['photo_used', 'invalid'],
    ];
    for (const [message, kind] of cases) {
      expect(toCommunityError({ message, code: 'P0001' }, 'x')).toMatchObject({ kind });
    }
  });
});
