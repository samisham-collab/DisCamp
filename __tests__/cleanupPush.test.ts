// The cleanup-push Edge Function's messages (supabase/functions/cleanup-push).

import { describe, expect, it } from '@jest/globals';

import {
  batches,
  buildMessages,
  eventFor,
  goneTokens,
  messageFor,
  type PushTarget,
} from '../supabase/functions/cleanup-push/message';

const TASK = '0000000a-0000-4000-8000-00000000c1ea';
const record = (status: string) => ({ id: 'c-1', task_id: TASK, camper_id: 'robin', status });

const target = (over: Partial<PushTarget>): PushTarget => ({
  token: 'ExponentPushToken[a]',
  role: 'approved',
  task_id: TASK,
  kind: 'litter',
  size: 'medium',
  spot_name: 'Litter Flat',
  embers: 100,
  reason: null,
  ...over,
});

describe('what happened', () => {
  it('sends on a new cleanup, and on a review', () => {
    expect(eventFor({ type: 'INSERT', table: 'cleanup_completions', record: record('pending') })).toBe('sent');
    expect(
      eventFor({
        type: 'UPDATE',
        table: 'cleanup_completions',
        record: record('approved'),
        old_record: record('pending'),
      }),
    ).toBe('approved');
    expect(
      eventFor({
        type: 'UPDATE',
        table: 'cleanup_completions',
        record: record('rejected'),
        old_record: record('pending'),
      }),
    ).toBe('rejected');
  });

  it('ignores everything else', () => {
    expect(eventFor(null)).toBeNull();
    expect(eventFor({ type: 'INSERT', table: 'flags', record: record('pending') })).toBeNull();
    expect(eventFor({ type: 'INSERT', table: 'cleanup_completions', record: null })).toBeNull();
    expect(eventFor({ type: 'INSERT', table: 'cleanup_completions', record: record('approved') })).toBeNull();
    expect(
      eventFor({ type: 'UPDATE', table: 'cleanup_completions', record: record('approved'), old_record: null }),
    ).toBeNull();
    expect(
      eventFor({
        type: 'UPDATE',
        table: 'cleanup_completions',
        record: record('approved'),
        old_record: record('approved'),
      }),
    ).toBeNull();
    expect(
      eventFor({
        type: 'UPDATE',
        table: 'cleanup_completions',
        record: record('pending'),
        old_record: record('pending'),
      }),
    ).toBeNull();
    expect(eventFor({ type: 'DELETE', table: 'cleanup_completions', record: record('pending') })).toBeNull();
  });
});

describe('the messages', () => {
  it('asks moderators to review, and opens Review', () => {
    expect(messageFor(target({ role: 'moderator', embers: null }))).toEqual({
      to: 'ExponentPushToken[a]',
      title: 'New cleanup to review',
      body: 'A camper cleaned up medium litter near Litter Flat. Tap to review it.',
      data: { url: '/review' },
      sound: 'default',
      channelId: 'cleanups',
    });
    expect(messageFor(target({ role: 'moderator', size: null, spot_name: null, kind: 'fire_ring' })).body).toBe(
      'A camper cleaned up trash in a fire ring. Tap to review it.',
    );
  });

  it('thanks the camper with their Embers, and opens the cleanup', () => {
    const m = messageFor(target({}));
    expect(m.title).toBe('Cleanup approved');
    expect(m.body).toBe('Thanks for leaving Litter Flat better. You earned 100 Embers.');
    expect(m.data.url).toBe(`/cleanup/${TASK}`);
    expect(messageFor(target({ embers: 1, spot_name: null })).body).toBe(
      'Thanks for leaving it better. You earned 1 Ember.',
    );
    expect(messageFor(target({ embers: 0 })).body).toMatch(/reached today's Embers limit/);
    expect(messageFor(target({ embers: null })).body).toBe('Thanks for leaving Litter Flat better.');
  });

  it('tells the camper who posted it', () => {
    const m = messageFor(target({ role: 'poster', embers: 10, kind: 'dumping' }));
    expect(m.title).toBe('Your cleanup got cleaned up');
    expect(m.body).toBe('A camper cleaned up the dumped trash you posted near Litter Flat. You earned 10 Embers.');
    expect(messageFor(target({ role: 'poster', embers: 0, kind: 'something new' })).body).toBe(
      'A camper cleaned up the mess you posted near Litter Flat.',
    );
  });

  it('says why a cleanup was sent back, cut to fit', () => {
    const m = messageFor(target({ role: 'sent_back', embers: null, reason: 'The after photo is blurry' }));
    expect(m.title).toBe('Cleanup sent back');
    expect(m.body).toBe(
      'A moderator sent back your cleanup near Litter Flat: "The after photo is blurry". You can try again.',
    );
    expect(messageFor(target({ role: 'sent_back', reason: null, spot_name: null })).body).toBe(
      'A moderator sent back your cleanup. You can try again.',
    );
    const long = messageFor(target({ role: 'sent_back', reason: 'x'.repeat(300) })).body;
    expect(Array.from(long)).toHaveLength(178);
    expect(long.endsWith('…')).toBe(true);
  });

  it('sends one message per phone, in batches Expo takes', () => {
    const messages = buildMessages([target({}), target({}), target({ token: 'ExponentPushToken[b]' })]);
    expect(messages.map((m) => m.to)).toEqual(['ExponentPushToken[a]', 'ExponentPushToken[b]']);
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches(Array.from({ length: 250 }, (_, i) => i)).map((b) => b.length)).toEqual([100, 100, 50]);
  });

  it('forgets phones Expo says are gone', () => {
    const messages = buildMessages([target({}), target({ token: 'ExponentPushToken[b]' })]);
    expect(
      goneTokens(messages, [
        { status: 'ok', id: '1' },
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      ]),
    ).toEqual(['ExponentPushToken[b]']);
    expect(goneTokens(messages, [{ status: 'error', details: { error: 'MessageRateExceeded' } }])).toEqual([]);
    expect(goneTokens([], [{ status: 'error', details: { error: 'DeviceNotRegistered' } }])).toEqual([]);
  });
});
