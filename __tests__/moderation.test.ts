import { afterEach, describe, expect, it, jest } from '@jest/globals';

import type * as Moderation from '@/data/moderation';
import {
  acceptTerms,
  bannedMessage,
  blockCamper,
  listBlocks,
  ModerationError,
  REPORT_REASONS,
  sendReport,
  toModerationError,
  unblockCamper,
} from '@/data/moderation';

import { ALEX, fakeBackend, NEWBIE, SAM, type QueryResult } from '../test/fakeSupabase';
import { makeRow } from '../test/fixtures';

type ModerationModule = typeof Moderation;

const ALEX_SPOT = makeRow({ id: 'alex-spot', name: 'Alex Hollow', created_by: ALEX.id, added_by: 'Alex' });

const silence = (level: 'warn' | 'error') => jest.spyOn(console, level).mockImplementation(() => undefined);

function signedIn(user = SAM) {
  const backend = fakeBackend([makeRow(), ALEX_SPOT]);
  backend.auth.setUser(ALEX);
  backend.auth.setUser(user);
  return backend;
}

/** Answers the next request with this error. */
function failNext(backend: ReturnType<typeof fakeBackend>, error: QueryResult['error']) {
  backend.intercept = () => {
    backend.intercept = null;
    return Promise.resolve({ data: null, error });
  };
}

describe('reports', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends a report about a spot or a name, once', async () => {
    const backend = signedIn();
    await expect(
      sendReport(backend.client, { kind: 'spot', id: 'alex-spot' }, 'fake', '  Gate is locked  '),
    ).resolves.toBe('sent');
    expect(backend.writes('flags', 'insert')[0]?.payload).toEqual({
      spot_id: 'alex-spot',
      reason: 'fake',
      details: 'Gate is locked',
    });
    await expect(sendReport(backend.client, { kind: 'spot', id: 'alex-spot' }, 'spam', '')).resolves.toBe('already');

    await expect(sendReport(backend.client, { kind: 'camper', id: ALEX.id }, 'offensive', '   ')).resolves.toBe('sent');
    expect(backend.writes('flags', 'insert')[2]?.payload).toEqual({ camper_id: ALEX.id, reason: 'offensive' });
    expect(backend.flags).toHaveLength(2);
  });

  it('sends a report about a check-in, and never about your own', async () => {
    const backend = signedIn();
    backend.checkins.push(
      { id: 4, spot_id: 'alex-spot', camper_id: ALEX.id, kind: 'trash', note: 'x', created_at: '2026-10-01T00:00:00Z' },
      { id: 5, spot_id: 'alex-spot', camper_id: SAM.id, kind: 'trash', note: 'y', created_at: '2026-10-01T00:00:00Z' },
    );
    await expect(sendReport(backend.client, { kind: 'checkin', id: '4' }, 'offensive', '')).resolves.toBe('sent');
    expect(backend.writes('flags', 'insert')[0]?.payload).toEqual({ checkin_id: 4, reason: 'offensive' });
    await expect(sendReport(backend.client, { kind: 'checkin', id: '4' }, 'spam', '')).resolves.toBe('already');
    await expect(sendReport(backend.client, { kind: 'checkin', id: '5' }, 'spam', '')).rejects.toMatchObject({
      kind: 'own',
    });
    await expect(sendReport(backend.client, { kind: 'checkin', id: '9' }, 'spam', '')).rejects.toMatchObject({
      kind: 'gone',
      message: "That's no longer on DisCamp.",
    });
  });

  it('keeps details to 500 characters', async () => {
    const backend = signedIn();
    await sendReport(backend.client, { kind: 'spot', id: 'alex-spot' }, 'other', 'x'.repeat(600));
    expect(backend.flags[0]?.details).toHaveLength(500);
  });

  it('explains each refusal', async () => {
    const alex = signedIn(ALEX);
    await expect(sendReport(alex.client, { kind: 'spot', id: 'alex-spot' }, 'fake', '')).rejects.toMatchObject({
      kind: 'own',
      message: "You can't report your own spot, photo, check-in or name.",
    });
    const sam = signedIn();
    await expect(sendReport(sam.client, { kind: 'spot', id: 'gone' }, 'fake', '')).rejects.toMatchObject({
      kind: 'gone',
    });
    sam.banned.add(SAM.id);
    await expect(sendReport(sam.client, { kind: 'spot', id: 'alex-spot' }, 'fake', '')).rejects.toMatchObject({
      kind: 'banned',
    });
    const cases: [QueryResult['error'], string][] = [
      [{ message: 'flag_limit', code: 'P0001' }, 'limit'],
      [{ message: 'TypeError: Network request failed' }, 'offline'],
      [{ message: 'permission denied for table flags', code: '42501' }, 'signed-out'],
      [{ message: 'JWT expired', code: 'PGRST303' }, 'signed-out'],
    ];
    for (const [error, kind] of cases) {
      const backend = signedIn();
      failNext(backend, error);
      await expect(sendReport(backend.client, { kind: 'spot', id: 'alex-spot' }, 'fake', '')).rejects.toMatchObject({
        kind,
      });
    }
  });

  it('reports a server problem it has no words for, and logs it', async () => {
    const error = silence('error');
    const backend = signedIn();
    failNext(backend, { message: 'something odd', code: 'XX000' });
    await expect(sendReport(backend.client, { kind: 'spot', id: 'alex-spot' }, 'fake', '')).rejects.toMatchObject({
      kind: 'server',
      message: "Couldn't send the report. Please try again.",
    });
    expect(error).toHaveBeenCalled();
  });

  it('gives up after the time limit', async () => {
    const backend = signedIn();
    backend.intercept = (query) =>
      new Promise((resolve) =>
        query.signal?.addEventListener('abort', () => resolve({ data: null, error: { message: 'AbortError' } })),
      );
    await expect(sendReport(backend.client, { kind: 'spot', id: 'alex-spot' }, 'fake', '', 5)).rejects.toMatchObject({
      kind: 'timeout',
    });
    // An answer that arrives after the time limit still counts as too late.
    backend.intercept = () => new Promise((resolve) => setTimeout(() => resolve({ data: null, error: null }), 30));
    await expect(blockCamper(backend.client, ALEX.id, 5)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('offers reasons that fit what is reported', () => {
    expect(REPORT_REASONS.spot.map((r) => r.value)).toEqual(['offensive', 'spam', 'fake', 'unsafe', 'other']);
    expect(REPORT_REASONS.camper.map((r) => r.value)).toEqual(['offensive', 'spam', 'other']);
  });
});

describe('blocking', () => {
  it('blocks, lists and unblocks campers', async () => {
    const backend = signedIn();
    await blockCamper(backend.client, ALEX.id);
    await blockCamper(backend.client, ALEX.id); // twice is fine
    expect(await listBlocks(backend.client)).toEqual([{ id: ALEX.id, name: 'Alex' }]);
    await unblockCamper(backend.client, ALEX.id);
    expect(await listBlocks(backend.client)).toEqual([]);
  });

  it('skips rows it can’t read and tidies names', async () => {
    const backend = signedIn();
    backend.intercept = () =>
      Promise.resolve({
        data: [
          { camper_id: ALEX.id, display_name: `  ${'A'.repeat(60)}  ` },
          { camper_id: NEWBIE.id, display_name: null },
          { camper_id: 'not-a-uuid', display_name: 'Odd' },
          'junk',
        ],
        error: null,
      });
    expect(await listBlocks(backend.client)).toEqual([
      { id: ALEX.id, name: 'A'.repeat(40) },
      { id: NEWBIE.id, name: null },
    ]);
    backend.intercept = () => Promise.resolve({ data: null, error: null });
    expect(await listBlocks(backend.client)).toEqual([]);
  });

  it('explains failures', async () => {
    silence('error');
    const backend = signedIn();
    await expect(blockCamper(backend.client, SAM.id)).rejects.toBeInstanceOf(ModerationError);
    failNext(backend, { message: 'boom' });
    await expect(unblockCamper(backend.client, ALEX.id)).rejects.toMatchObject({ kind: 'server' });
    failNext(backend, { message: 'Network request failed' });
    await expect(listBlocks(backend.client)).rejects.toMatchObject({ kind: 'offline' });
  });
});

describe('the terms of use', () => {
  it('records that a camper agreed', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(NEWBIE);
    expect(backend.terms.has(NEWBIE.id)).toBe(false);
    await acceptTerms(backend.client, 1);
    expect(backend.terms.get(NEWBIE.id)).toBe(1);
  });

  it('turns away an out-of-date app, or a signed-out one', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(NEWBIE);
    await expect(acceptTerms(backend.client, 0)).rejects.toMatchObject({
      kind: 'outdated',
      message: expect.stringContaining('Update the app'),
    });
    backend.auth.setUser(null);
    await expect(acceptTerms(backend.client, 1)).rejects.toMatchObject({ kind: 'signed-out' });
  });
});

describe('messages', () => {
  it('passes its own errors through, and describes anything thrown', () => {
    const own = new ModerationError('Already explained', 'limit');
    expect(toModerationError(own, 'x')).toBe(own);
    expect(toModerationError('Network request failed', 'x').kind).toBe('offline');
  });

  it('points a banned camper to support when there is a support email', () => {
    expect(bannedMessage()).toBe("Your account can't post or report anything on DisCamp.");
    jest.isolateModules(() => {
      process.env.EXPO_PUBLIC_SUPPORT_EMAIL = 'help@discamp.test';
      const fresh = jest.requireActual<ModerationModule>('@/data/moderation');
      expect(fresh.bannedMessage()).toBe(
        "Your account can't post or report anything on DisCamp. If you think this is a mistake, email help@discamp.test.",
      );
      delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
    });
  });
});
