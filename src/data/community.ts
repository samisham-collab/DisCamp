// Photos and check-ins ("Still good" or a change report) on the server
// (migration 0006). The database decides what's allowed; this file turns its
// answers into plain messages. No React here, so every path can be unit tested.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { REMOTE_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from '../config';
import { DeadlineError, withDeadline } from '../lib/deadline';
import { describeError, log } from '../lib/log';
import type { PreparedPhoto } from '../lib/photoPicker';
import { checkinKind, toIsoTime } from '../lib/schemas';
import type { ChangeKind, CheckinKind } from '../types';
import { bannedMessage } from './moderation';

/** Where photo files live in Supabase Storage. */
export const PHOTO_BUCKET = 'spot-photos';
/** Photos one camper can add to one spot (the database holds this too). */
export const MAX_PHOTOS_PER_SPOT = 3;
export const MAX_CHECKIN_NOTE = 300;
/** The after photo of a cleanup is taken within this many meters of its pin (0008). */
export const CLEANUP_RADIUS_M = 150;
/**
 * A cleanup's photos need a location the phone is sure of to within this
 * many meters. Approximate location (iPhone's Precise Location off, or
 * Android's "Approximate") is off by a kilometer or more: a cleanup pinned
 * there could never be found within 150 m.
 */
export const MAX_FIX_ACCURACY_M = 75;

/** True when the phone only shared a rough location (see MAX_FIX_ACCURACY_M). */
export function isRoughFix(fix: { accuracy?: number | null } | null): boolean {
  return fix?.accuracy != null && fix.accuracy > MAX_FIX_ACCURACY_M;
}

/** What to tell a camper whose phone only shared a rough location. */
export function roughFixMessage(fix: { accuracy?: number | null }, retake: string): string {
  const within = Math.round(fix.accuracy ?? 0);
  const rough = within >= 1000 ? `${(within / 1609.34).toFixed(1)} mi` : `${within} m`;
  return `Your phone only shared an approximate location (within about ${rough}). Turn on Precise Location for DisCamp in Settings, then ${retake}.`;
}
/** A camper can say "Still good" about a spot once in this many days (0007). */
export const CONFIRM_AGAIN_DAYS = 30;
const DAY_MS = 86_400_000;

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  road_damage: 'Road washed out or damaged',
  gate_closed: 'Gate locked or road closed',
  trash: 'Trash or damage at the site',
  closed: 'Camping closed here now',
  other: 'Something else changed',
};

export const CHANGE_OPTIONS: readonly { value: ChangeKind; label: string }[] = (
  Object.keys(CHANGE_LABELS) as ChangeKind[]
).map((value) => ({ value, label: CHANGE_LABELS[value] }));

export type CommunityErrorKind =
  'offline' | 'timeout' | 'signed-out' | 'banned' | 'terms' | 'limit' | 'already' | 'invalid' | 'gone' | 'server';

export class CommunityError extends Error {
  constructor(
    message: string,
    readonly kind: CommunityErrorKind,
  ) {
    super(message);
    this.name = 'CommunityError';
  }
}

type ErrorLike = { message: string; code?: string };

const NETWORK = /network request failed|failed to fetch|network error|load failed/i;

/** The database's (or Storage's) answer as something a camper can act on. */
export function toCommunityError(error: unknown, fallback: string): CommunityError {
  if (error instanceof CommunityError) return error;
  const e: ErrorLike =
    error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? (error as ErrorLike)
      : { message: describeError(error) };
  if (NETWORK.test(e.message)) return new CommunityError("You're offline. Try again when you have signal.", 'offline');
  switch (e.message) {
    case 'banned':
      return new CommunityError(bannedMessage(), 'banned');
    case 'terms_required':
      return new CommunityError('Agree to the DisCamp community rules first.', 'terms');
    case 'blocked_words':
      return new CommunityError("Some words aren't allowed on DisCamp. Change them, then try again.", 'invalid');
    case 'photo_limit_spot':
      return new CommunityError(`You can add up to ${MAX_PHOTOS_PER_SPOT} photos to a spot.`, 'limit');
    case 'photo_limit_day':
      return new CommunityError("You've added a lot of photos today. Try again tomorrow.", 'limit');
    case 'confirmed_recently':
      return new CommunityError(
        `You've confirmed this spot in the last ${CONFIRM_AGAIN_DAYS} days. Thanks!`,
        'already',
      );
    case 'checkin_recent':
      return new CommunityError("You've already said that about this spot today. Thanks!", 'already');
    case 'own_spot':
      return new CommunityError('You added this spot, so other campers confirm it.', 'invalid');
    case 'checkin_limit':
      return new CommunityError("You've checked in a lot today. Try again tomorrow.", 'limit');
    case 'spot_gone':
      return new CommunityError('That spot is no longer on DisCamp.', 'gone');
    // Cleanups (migration 0008).
    case 'spot_too_far':
      return new CommunityError('That spot is more than 2 km from here. Post the cleanup without it.', 'invalid');
    case 'cleanup_nearby':
      return new CommunityError(
        'Someone already posted a cleanup within 30 m of here. Find it in Cleanups and clean that one up.',
        'already',
      );
    case 'cleanup_limit':
      return new CommunityError("You've done a lot of cleanups today. Try again tomorrow.", 'limit');
    case 'cleanup_gone':
    case 'review_gone':
      return new CommunityError('That cleanup is no longer on DisCamp.', 'gone');
    case 'cleanup_done':
      return new CommunityError('Someone already cleaned this up. Thanks for stopping!', 'already');
    case 'cleanup_in_review':
      return new CommunityError(
        "Someone's cleanup of this is waiting for review. Check back in a day or two.",
        'already',
      );
    case 'cleanup_too_far':
      return new CommunityError(
        `Take the after photo within ${CLEANUP_RADIUS_M} m of the cleanup's pin, then try again.`,
        'invalid',
      );
    case 'cleanup_tries':
      return new CommunityError("You've sent this cleanup for review twice, which is the most.", 'limit');
    case 'photo_used':
      return new CommunityError('That photo is already on DisCamp. Take a new one.', 'invalid');
    case 'not_moderator':
      return new CommunityError('Only DisCamp moderators review cleanups.', 'invalid');
    case 'review_done':
      return new CommunityError('This cleanup was already reviewed.', 'already');
    case 'reason_needed':
      return new CommunityError('Say why, so the camper can fix it.', 'invalid');
    case 'not_signed_in':
      return new CommunityError('Your sign-in has expired. Sign in again, then try again.', 'signed-out');
  }
  if (
    e.code === 'PGRST301' ||
    e.code === 'PGRST303' ||
    e.code === '42501' ||
    /jwt|not authenticated|unauthorized|row-level security/i.test(e.message)
  ) {
    return new CommunityError('Your sign-in has expired. Sign in again, then try again.', 'signed-out');
  }
  if (e.code === '23503') return new CommunityError('That spot is no longer on DisCamp.', 'gone');
  log.error(fallback, error);
  return new CommunityError(`${fallback} Please try again.`, 'server');
}

/** Runs one request with a time limit, and turns a refusal into a CommunityError. */
export async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number, fallback: string) {
  try {
    return await withDeadline(run, timeoutMs);
  } catch (error) {
    if (error instanceof DeadlineError) {
      throw new CommunityError('The server took too long to answer. Try again.', 'timeout');
    }
    throw toCommunityError(error, fallback);
  }
}

// --- Photos ---------------------------------------------------------------------

export interface SpotPhoto {
  id: string;
  spotId: string;
  /** Where the file is, inside the bucket: "<camper id>/<photo id>.jpg". */
  path: string;
  /** The public address of the file. */
  url: string;
  width: number;
  height: number;
  createdBy?: string;
  addedBy?: string;
  createdAt: string;
  /** Your own photo, hidden while it's reviewed after reports. */
  hidden?: true;
}

const photoRowSchema = z.object({
  id: z.string().uuid(),
  spot_id: z.string(),
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  created_by: z.string().uuid().nullable(),
  added_by: z.string().nullable(),
  created_at: z.string(),
  hidden: z.boolean().nullable().optional(),
});

function toPhoto(client: SupabaseClient, row: unknown): SpotPhoto | null {
  const parsed = photoRowSchema.safeParse(row);
  if (!parsed.success) return null;
  const r = parsed.data;
  const name = r.added_by?.trim().slice(0, 40);
  return {
    id: r.id,
    spotId: r.spot_id,
    path: r.path,
    url: client.storage.from(PHOTO_BUCKET).getPublicUrl(r.path).data.publicUrl,
    width: r.width,
    height: r.height,
    ...(r.created_by ? { createdBy: r.created_by } : {}),
    ...(name ? { addedBy: name } : {}),
    createdAt: toIsoTime(r.created_at) ?? r.created_at,
    ...(r.hidden === true ? { hidden: true as const } : {}),
  };
}

/** A spot's photos, oldest first. Rows that don't parse are left out. */
export function listPhotos(
  client: SupabaseClient,
  spotId: string,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<SpotPhoto[]> {
  return withTimeout(
    async (signal) => {
      const { data, error } = await client
        .from('spot_photos_api')
        .select('*')
        .eq('spot_id', spotId)
        .order('created_at')
        .retry(false)
        .abortSignal(signal);
      if (error) throw error;
      return (Array.isArray(data) ? data : []).flatMap((row) => toPhoto(client, row) ?? []);
    },
    timeoutMs,
    "Couldn't load the photos.",
  );
}

export interface NewPhoto {
  spotId: string;
  /** Picked by the app once per photo, so a retry never adds it twice. */
  id: string;
  /** The signed-in camper: photos go in their own folder. */
  userId: string;
  photo: PreparedPhoto;
}

const ALREADY_UPLOADED = /already exists|duplicate/i;
const STORAGE_REFUSED = /row-level security|unauthorized|forbidden/i;

/** The database answered and said no (rather than the answer getting lost). */
const REFUSED = /^(P0001|PGRST|2[23]|42)/;

/**
 * Uploads the file, then adds it to the spot. Trying again with the same id
 * after a lost answer finds the file (and the photo) already there and
 * carries on.
 */
/** A write's answer, as supabase-js gives it. */
type WriteAnswer = { error: ErrorLike | null };

/**
 * Uploads a photo file into the camper's folder. A file already there (a
 * retry after a lost answer) is fine. Storage only says no, not why: then
 * `explain` sends the write the file was for, and the database says why
 * (banned, rules not agreed to, signed out). With no file, it can't succeed.
 */
export async function uploadPhotoFile(
  client: SupabaseClient,
  path: string,
  photo: PreparedPhoto,
  readBytes: (uri: string) => Promise<ArrayBuffer>,
  explain: () => PromiseLike<WriteAnswer>,
): Promise<void> {
  const bytes = await readBytes(photo.uri);
  const upload = await client.storage
    .from(PHOTO_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (!upload.error || ALREADY_UPLOADED.test(upload.error.message)) return;
  if (STORAGE_REFUSED.test(upload.error.message) || String(upload.error.statusCode ?? '') === '403') {
    const { error } = await explain();
    if (error && error.message !== 'photo_missing') throw error;
    throw new CommunityError(
      "DisCamp couldn't take this photo. If you've added a lot today, try again tomorrow; if not, sign out and back in.",
      'limit',
    );
  }
  throw upload.error;
}

/**
 * After the database refused a write, removes the files uploaded for it, so
 * they don't linger. Not when the answer was lost (the write may well have
 * worked, and needs them).
 */
export async function removeRefusedFiles(
  client: SupabaseClient,
  error: ErrorLike,
  signal: AbortSignal,
  paths: string[],
): Promise<void> {
  if (signal.aborted || !REFUSED.test(error.code ?? '')) return;
  await client.storage
    .from(PHOTO_BUCKET)
    .remove(paths)
    .catch(() => undefined);
}

export function addPhoto(
  client: SupabaseClient,
  { spotId, id, userId, photo }: NewPhoto,
  readBytes: (uri: string) => Promise<ArrayBuffer>,
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<SpotPhoto> {
  const path = `${userId}/${id}.jpg`;
  return withTimeout(
    async (signal) => {
      const insert = () =>
        client
          .from('spot_photos')
          .insert({ id, spot_id: spotId, path, width: photo.width, height: photo.height })
          .retry(false)
          .abortSignal(signal);
      await uploadPhotoFile(client, path, photo, readBytes, insert);
      const { error } = await insert();
      if (error && error.code !== '23505') {
        await removeRefusedFiles(client, error, signal, [path]);
        throw error;
      }
      const { data, error: readError } = await client
        .from('spot_photos_api')
        .select('*')
        .eq('id', id)
        .retry(false)
        .abortSignal(signal)
        .single();
      if (readError) throw readError;
      const added = toPhoto(client, data);
      if (!added)
        throw new CommunityError('Your photo was added, but it could not be shown. Reopen the spot.', 'server');
      return added;
    },
    timeoutMs,
    "Couldn't add the photo.",
  );
}

/** Deletes one of your own photos (and its file). */
export function deletePhoto(
  client: SupabaseClient,
  photo: Pick<SpotPhoto, 'id' | 'path'>,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<void> {
  return withTimeout(
    async (signal) => {
      const { data, error } = await client
        .from('spot_photos')
        .delete()
        .eq('id', photo.id)
        .select('id')
        .retry(false)
        .abortSignal(signal);
      if (error) throw error;
      if (!Array.isArray(data) || data.length === 0) {
        throw new CommunityError(
          "This photo can't be deleted while reports about it are reviewed (usually within a day). Try again later.",
          'invalid',
        );
      }
      // The listing is gone either way; a file left behind is only clutter.
      const removed = await client.storage
        .from(PHOTO_BUCKET)
        .remove([photo.path])
        .catch((e: unknown) => ({ error: e }));
      if (removed.error) log.warn('Could not delete a photo file', { error: describeError(removed.error) });
    },
    timeoutMs,
    "Couldn't delete the photo.",
  );
}

// --- Check-ins -----------------------------------------------------------------------

export interface Checkin {
  id: number;
  spotId: string;
  camperId?: string;
  camperName?: string;
  kind: CheckinKind;
  note?: string;
  createdAt: string;
  /** Your own "Still good", taken back by a change report you sent later. */
  withdrawn?: true;
}

const checkinRowSchema = z.object({
  id: z.number().int(),
  spot_id: z.string(),
  camper_id: z.string().uuid().nullable(),
  camper_name: z.string().nullable(),
  kind: checkinKind,
  note: z.string().nullable(),
  created_at: z.string(),
  withdrawn: z.boolean().nullable().optional(),
});

/** A spot's latest check-ins, newest first. Rows that don't parse are left out. */
export function listCheckins(
  client: SupabaseClient,
  spotId: string,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<Checkin[]> {
  return withTimeout(
    async (signal) => {
      const { data, error } = await client
        .from('checkins_api')
        .select('*')
        .eq('spot_id', spotId)
        .order('created_at', { ascending: false })
        .limit(20)
        .retry(false)
        .abortSignal(signal);
      if (error) throw error;
      return (Array.isArray(data) ? data : []).flatMap((row) => {
        const parsed = checkinRowSchema.safeParse(row);
        if (!parsed.success) return [];
        const r = parsed.data;
        const name = r.camper_name?.trim().slice(0, 40);
        const note = r.note?.trim().slice(0, MAX_CHECKIN_NOTE);
        return [
          {
            id: r.id,
            spotId: r.spot_id,
            ...(r.camper_id ? { camperId: r.camper_id } : {}),
            ...(name ? { camperName: name } : {}),
            kind: r.kind,
            ...(note ? { note } : {}),
            createdAt: toIsoTime(r.created_at) ?? r.created_at,
            ...(r.withdrawn === true ? { withdrawn: true as const } : {}),
          },
        ];
      });
    },
    timeoutMs,
    "Couldn't load what campers reported.",
  );
}

/** A camper's latest "Still good" on a spot. */
export interface MyConfirmation {
  at: string;
  /** Taken back by a change report they sent afterwards. */
  withdrawn: boolean;
}

const confirmationRowSchema = z.object({
  created_at: z.string(),
  withdrawn: z.boolean().nullable().optional(),
});

/** This camper's latest "Still good" on a spot (taken back or not), or null for none. */
export function myLastConfirmation(
  client: SupabaseClient,
  spotId: string,
  camperId: string,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<MyConfirmation | null> {
  return withTimeout(
    async (signal) => {
      const { data, error } = await client
        .from('checkins_api')
        .select('created_at, withdrawn')
        .eq('spot_id', spotId)
        .eq('camper_id', camperId)
        .eq('kind', 'still_good')
        .order('created_at', { ascending: false })
        .limit(1)
        .retry(false)
        .abortSignal(signal);
      if (error) throw error;
      const row = confirmationRowSchema.safeParse(Array.isArray(data) ? data[0] : undefined);
      if (!row.success) return null;
      return { at: toIsoTime(row.data.created_at) ?? row.data.created_at, withdrawn: row.data.withdrawn === true };
    },
    timeoutMs,
    "Couldn't check your last visit.",
  );
}

/** When this camper may say "Still good" here again, or null if they may now. */
export function confirmAgainAt(mine: MyConfirmation | null | undefined, now: Date = new Date()): Date | null {
  if (!mine) return null;
  const at = Date.parse(mine.at);
  if (Number.isNaN(at)) return null;
  const again = new Date(at + CONFIRM_AGAIN_DAYS * DAY_MS);
  return again > now ? again : null;
}

/** "Still good", or a change. */
export function sendCheckin(
  client: SupabaseClient,
  spotId: string,
  kind: CheckinKind,
  note = '',
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<void> {
  return withTimeout(
    async (signal) => {
      const text = note.trim().slice(0, MAX_CHECKIN_NOTE);
      const { error } = await client
        .from('checkins')
        .insert({ spot_id: spotId, kind, ...(text ? { note: text } : {}) })
        .retry(false)
        .abortSignal(signal);
      if (error) throw error;
    },
    timeoutMs,
    "Couldn't send that.",
  );
}
