// Reports, blocks and the terms of use, on the server (migration 0004).
// The database decides what's allowed; this file turns its answers into
// plain messages. No React here, so every path can be unit tested.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { MAX_REPORT_DETAILS, REMOTE_TIMEOUT_MS, SUPPORT_EMAIL } from '../config';
import { DeadlineError, withDeadline } from '../lib/deadline';
import { describeError, log } from '../lib/log';

export type ReportReason = 'offensive' | 'spam' | 'fake' | 'unsafe' | 'other';

/** What a camper can report: a spot, a photo, a check-in, a cleanup, or the name of the camper who added one. */
export type ReportTarget =
  | { kind: 'spot'; id: string }
  | { kind: 'camper'; id: string }
  | { kind: 'photo'; id: string }
  | { kind: 'checkin'; id: string }
  | { kind: 'task'; id: string };

export const REPORT_REASONS: Record<ReportTarget['kind'], readonly { value: ReportReason; label: string }[]> = {
  spot: [
    { value: 'offensive', label: 'Offensive or abusive' },
    { value: 'spam', label: 'Spam or advertising' },
    { value: 'fake', label: 'Not a real spot, or in the wrong place' },
    { value: 'unsafe', label: 'Unsafe, closed or private land' },
    { value: 'other', label: 'Something else' },
  ],
  camper: [
    { value: 'offensive', label: 'Offensive or abusive name' },
    { value: 'spam', label: 'Spam or pretending to be someone' },
    { value: 'other', label: 'Something else' },
  ],
  photo: [
    { value: 'offensive', label: 'Offensive, violent or sexual' },
    { value: 'unsafe', label: "Shows someone's face, plate or private details" },
    { value: 'fake', label: 'Not a photo of this spot' },
    { value: 'spam', label: 'Spam or advertising' },
    { value: 'other', label: 'Something else' },
  ],
  checkin: [
    { value: 'offensive', label: 'Offensive or abusive' },
    { value: 'fake', label: 'Not true, or about another spot' },
    { value: 'spam', label: 'Spam or advertising' },
    { value: 'other', label: 'Something else' },
  ],
  task: [
    { value: 'offensive', label: 'Offensive, violent or sexual' },
    { value: 'unsafe', label: "Shows someone's face, plate or private details" },
    { value: 'fake', label: "Not real, or there's no trash here" },
    { value: 'spam', label: 'Spam or advertising' },
    { value: 'other', label: 'Something else' },
  ],
};

export type ModerationErrorKind =
  'offline' | 'timeout' | 'signed-out' | 'banned' | 'own' | 'limit' | 'gone' | 'outdated' | 'server';

export class ModerationError extends Error {
  constructor(
    message: string,
    readonly kind: ModerationErrorKind,
  ) {
    super(message);
    this.name = 'ModerationError';
  }
}

/** For a banned camper, everywhere the app explains why a write was refused. */
export function bannedMessage(): string {
  return `Your account can't post or report anything on DisCamp.${
    SUPPORT_EMAIL ? ` If you think this is a mistake, email ${SUPPORT_EMAIL}.` : ''
  }`;
}

type ErrorLike = { message: string; code?: string };

const NETWORK = /network request failed|failed to fetch|network error|load failed/i;

/** The database's answer as something a camper can act on. */
export function toModerationError(error: unknown, fallback: string): ModerationError {
  if (error instanceof ModerationError) return error;
  const e: ErrorLike =
    error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? (error as ErrorLike)
      : { message: describeError(error) };
  if (NETWORK.test(e.message)) return new ModerationError("You're offline. Try again when you have signal.", 'offline');
  switch (e.message) {
    case 'banned':
      return new ModerationError(bannedMessage(), 'banned');
    case 'own_content':
      return new ModerationError("You can't report your own spot, photo, check-in, cleanup or name.", 'own');
    case 'flag_limit':
      return new ModerationError("You've sent a lot of reports today. Try again tomorrow.", 'limit');
    case 'terms_outdated':
      return new ModerationError(
        'DisCamp has new terms of use. Update the app from the App Store to read them, then try again.',
        'outdated',
      );
    case 'not_signed_in':
      return new ModerationError('Your sign-in has expired. Sign in again, then try again.', 'signed-out');
  }
  if (
    e.code === '42501' ||
    e.code === 'PGRST301' ||
    e.code === 'PGRST303' ||
    /jwt|not authenticated/i.test(e.message)
  ) {
    return new ModerationError('Your sign-in has expired. Sign in again, then try again.', 'signed-out');
  }
  // 23503: what was reported is no longer there (deleted in the meantime).
  if (e.code === '23503') return new ModerationError("That's no longer on DisCamp.", 'gone');
  log.error(fallback, error);
  return new ModerationError(`${fallback} Please try again.`, 'server');
}

/** Runs one request with a time limit and no hidden retries. */
async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number, fallback: string) {
  try {
    return await withDeadline(run, timeoutMs);
  } catch (error) {
    if (error instanceof DeadlineError) {
      throw new ModerationError('The server took too long to answer. Try again.', 'timeout');
    }
    throw toModerationError(error, fallback);
  }
}

/**
 * Sends a report. "already" when this camper has an open report on it
 * already: nothing new is sent, and the camper hears it's in hand.
 */
export function sendReport(
  client: SupabaseClient,
  target: ReportTarget,
  reason: ReportReason,
  details: string,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<'sent' | 'already'> {
  return withTimeout(
    async (signal) => {
      const text = details.trim().slice(0, MAX_REPORT_DETAILS);
      const { error } = await client
        .from('flags')
        .insert({
          ...{
            spot: { spot_id: target.id },
            photo: { photo_id: target.id },
            checkin: { checkin_id: Number(target.id) },
            task: { task_id: target.id },
            camper: { camper_id: target.id },
          }[target.kind],
          reason,
          ...(text ? { details: text } : {}),
        })
        .retry(false)
        .abortSignal(signal);
      if (error?.code === '23505') return 'already';
      if (error) throw error;
      return 'sent';
    },
    timeoutMs,
    "Couldn't send the report.",
  );
}

/** Stops showing a camper's spots to this camper. Blocking twice is fine. */
export function blockCamper(client: SupabaseClient, camperId: string, timeoutMs = REMOTE_TIMEOUT_MS): Promise<void> {
  return withTimeout(
    async (signal) => {
      const { error } = await client.from('blocks').insert({ blocked_id: camperId }).retry(false).abortSignal(signal);
      if (error && error.code !== '23505') throw error;
    },
    timeoutMs,
    "Couldn't block this camper.",
  );
}

export function unblockCamper(client: SupabaseClient, camperId: string, timeoutMs = REMOTE_TIMEOUT_MS): Promise<void> {
  return withTimeout(
    async (signal) => {
      const { error } = await client
        .from('blocks')
        .delete()
        .eq('blocked_id', camperId)
        .retry(false)
        .abortSignal(signal);
      if (error) throw error;
    },
    timeoutMs,
    "Couldn't unblock this camper.",
  );
}

export interface BlockedCamper {
  id: string;
  /** Null if they've since deleted their account. */
  name: string | null;
}

const blockRowSchema = z.object({
  camper_id: z.string().uuid(),
  display_name: z.string().nullable(),
});

/** Campers this camper has blocked, newest first. Rows that don't parse are left out. */
export function listBlocks(client: SupabaseClient, timeoutMs = REMOTE_TIMEOUT_MS): Promise<BlockedCamper[]> {
  return withTimeout(
    async (signal) => {
      const { data, error } = await client.rpc('my_blocks').retry(false).abortSignal(signal);
      if (error) throw error;
      const rows: unknown[] = Array.isArray(data) ? data : [];
      return rows.flatMap((row) => {
        const parsed = blockRowSchema.safeParse(row);
        if (!parsed.success) return [];
        const name = parsed.data.display_name?.trim();
        return [{ id: parsed.data.camper_id, name: name ? name.slice(0, 40) : null }];
      });
    },
    timeoutMs,
    "Couldn't load the campers you've blocked.",
  );
}

/** Records that this camper agreed to `version` of the terms of use. */
export function acceptTerms(client: SupabaseClient, version: number, timeoutMs = REMOTE_TIMEOUT_MS): Promise<void> {
  return withTimeout(
    async (signal) => {
      const { error } = await client.rpc('accept_terms', { version }).retry(false).abortSignal(signal);
      if (error) throw error;
    },
    timeoutMs,
    "Couldn't save that you agreed.",
  );
}
