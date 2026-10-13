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
    case 'checkin_recent':
      return new CommunityError("You've already said that about this spot today. Thanks!", 'already');
    case 'own_spot':
      return new CommunityError('You added this spot, so other campers confirm it.', 'invalid');
    case 'checkin_limit':
      return new CommunityError("You've checked in a lot today. Try again tomorrow.", 'limit');
    case 'spot_gone':
      return new CommunityError('That spot is no longer on DisCamp.', 'gone');
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

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number, fallback: string) {
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
export function addPhoto(
  client: SupabaseClient,
  { spotId, id, userId, photo }: NewPhoto,
  readBytes: (uri: string) => Promise<ArrayBuffer>,
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<SpotPhoto> {
  const path = `${userId}/${id}.jpg`;
  return withTimeout(
    async (signal) => {
      const bytes = await readBytes(photo.uri);
      const upload = await client.storage
        .from(PHOTO_BUCKET)
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      if (upload.error && !ALREADY_UPLOADED.test(upload.error.message)) {
        if (STORAGE_REFUSED.test(upload.error.message) || String(upload.error.statusCode ?? '') === '403') {
          // Storage only says no. The database says why (banned, rules not
          // agreed to, signed out); with no file, it can't add the photo.
          const { error } = await client
            .from('spot_photos')
            .insert({ id, spot_id: spotId, path, width: photo.width, height: photo.height })
            .retry(false)
            .abortSignal(signal);
          if (error && error.message !== 'photo_missing') throw error;
          throw new CommunityError(
            "DisCamp couldn't take this photo. If you've added a lot today, try again tomorrow; if not, sign out and back in.",
            'limit',
          );
        }
        throw upload.error;
      }
      const { error } = await client
        .from('spot_photos')
        .insert({ id, spot_id: spotId, path, width: photo.width, height: photo.height })
        .retry(false)
        .abortSignal(signal);
      if (error && error.code !== '23505') {
        // Refused: don't leave the file behind. If the answer was lost, the
        // photo may well be added, so the file stays for it.
        if (!signal.aborted && REFUSED.test(error.code ?? '')) {
          await client.storage
            .from(PHOTO_BUCKET)
            .remove([path])
            .catch(() => undefined);
        }
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
}

const checkinRowSchema = z.object({
  id: z.number().int(),
  spot_id: z.string(),
  camper_id: z.string().uuid().nullable(),
  camper_name: z.string().nullable(),
  kind: checkinKind,
  note: z.string().nullable(),
  created_at: z.string(),
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
          },
        ];
      });
    },
    timeoutMs,
    "Couldn't load what campers reported.",
  );
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
