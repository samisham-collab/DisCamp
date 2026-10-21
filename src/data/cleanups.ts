// Cleanups on the server (migration 0008): posting one with a before photo,
// sending an after photo and haul shot for review, the moderator's review,
// and the Embers they earn. The database decides what's allowed; this file
// turns its answers into plain messages. No React here, so every path can be
// unit tested.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { REMOTE_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from '../config';
import { DeadlineError, withDeadline } from '../lib/deadline';
import type { CleanupSize, EmberReason } from '../lib/embers';
import { describeError, log } from '../lib/log';
import type { PreparedPhoto } from '../lib/photoPicker';
import { toIsoTime } from '../lib/schemas';
import type { Coordinates, Fix } from '../types';
import {
  CommunityError,
  PHOTO_BUCKET,
  photoUrl,
  previewPathFor,
  removeRefusedFiles,
  uploadPhotoFile,
  withPreviews,
  withTimeout,
} from './community';

export type { CleanupSize } from '../lib/embers';
export type CleanupKind = 'litter' | 'fire_ring' | 'dumping' | 'other';
/** open: waiting for someone; review: a cleanup waits for a moderator; done. */
export type CleanupStatus = 'open' | 'review' | 'done';

export const CLEANUP_KIND_LABELS: Record<CleanupKind, string> = {
  litter: 'Litter',
  fire_ring: 'Trash in a fire ring',
  dumping: 'Dumped trash or junk',
  other: 'Other mess',
};

export const CLEANUP_KIND_OPTIONS: readonly { value: CleanupKind; label: string }[] = (
  Object.keys(CLEANUP_KIND_LABELS) as CleanupKind[]
).map((value) => ({ value, label: CLEANUP_KIND_LABELS[value] }));

export const CLEANUP_SIZE_LABELS: Record<CleanupSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

export const CLEANUP_SIZE_HINTS: Record<CleanupSize, string> = {
  small: 'Fits in one bag',
  medium: '2 to 4 bags',
  large: '5 or more bags, or bulky items',
};

export const CLEANUP_SIZE_OPTIONS: readonly { value: CleanupSize; label: string }[] = (
  Object.keys(CLEANUP_SIZE_LABELS) as CleanupSize[]
).map((value) => ({ value, label: `${CLEANUP_SIZE_LABELS[value]}: ${CLEANUP_SIZE_HINTS[value].toLowerCase()}` }));

export const MAX_CLEANUP_NOTE = 300;
/** A camper can send a cleanup for review this many times (0008). */
export const CLEANUP_TRIES = 2;
/**
 * The app links a cleanup to a spot this close. The database allows 2 km;
 * staying a little inside it covers the two measuring distance slightly
 * differently.
 */
export const SPOT_LINK_RADIUS_M = 1_900;
/** How many cleanups the list loads, newest first. */
export const CLEANUP_LIST_LIMIT = 500;

const PHOTO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;

const publicUrl = photoUrl;

/** "SRID=4326;POINT(lng lat)", rounded to about 10 cm, as PostGIS reads it. */
function pointText(at: Coordinates): string {
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  return `SRID=4326;POINT(${round(at.longitude)} ${round(at.latitude)})`;
}

const clean = (text: string | null | undefined, max = 40) => text?.trim().slice(0, max) || undefined;

// --- Cleanups ---------------------------------------------------------------------

export interface CleanupTask extends Coordinates {
  id: string;
  kind: CleanupKind;
  size: CleanupSize;
  note?: string;
  status: CleanupStatus;
  beforePath: string;
  beforeUrl: string;
  /** Its small preview, for lists (older photos may not have one). */
  beforePreviewUrl: string;
  createdBy?: string;
  postedBy?: string;
  createdAt: string;
  spotId?: string;
  spotName?: string;
  /** Your own cleanup, hidden while it's reviewed after reports. */
  hidden?: true;
  doneAt?: string;
  /** Once approved: who cleaned it up, and their photos. */
  cleanedById?: string;
  cleanedBy?: string;
  afterUrl?: string;
  haulUrl?: string;
}

const taskRowSchema = z.object({
  id: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  kind: z.enum(['litter', 'fire_ring', 'dumping', 'other']),
  size: z.enum(['small', 'medium', 'large']),
  note: z.string().nullable(),
  status: z.enum(['open', 'review', 'done']),
  before_path: z.string().regex(PHOTO_PATH),
  created_by: z.string().uuid().nullable(),
  posted_by: z.string().nullable(),
  created_at: z.string(),
  spot_id: z.string().nullable(),
  spot_name: z.string().nullable(),
  hidden: z.boolean().nullable().optional(),
  done_at: z.string().nullable(),
  cleaned_by_id: z.string().uuid().nullable(),
  cleaned_by: z.string().nullable(),
  after_path: z.string().regex(PHOTO_PATH).nullable(),
  haul_path: z.string().regex(PHOTO_PATH).nullable(),
});

/** A row of cleanup_tasks_api as a CleanupTask, or null if it doesn't parse. */
export function toCleanup(client: SupabaseClient, row: unknown): CleanupTask | null {
  const parsed = taskRowSchema.safeParse(row);
  if (!parsed.success) return null;
  const r = parsed.data;
  const note = clean(r.note, MAX_CLEANUP_NOTE);
  const postedBy = clean(r.posted_by);
  const spotName = clean(r.spot_name, 80);
  const cleanedBy = clean(r.cleaned_by);
  const doneAt = r.done_at ? (toIsoTime(r.done_at) ?? r.done_at) : undefined;
  return {
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    kind: r.kind,
    size: r.size,
    ...(note ? { note } : {}),
    status: r.status,
    beforePath: r.before_path,
    beforeUrl: publicUrl(client, r.before_path),
    beforePreviewUrl: publicUrl(client, previewPathFor(r.before_path)),
    ...(r.created_by ? { createdBy: r.created_by } : {}),
    ...(postedBy ? { postedBy } : {}),
    createdAt: toIsoTime(r.created_at) ?? r.created_at,
    ...(r.spot_id ? { spotId: r.spot_id } : {}),
    ...(spotName ? { spotName } : {}),
    ...(r.hidden === true ? { hidden: true as const } : {}),
    ...(doneAt ? { doneAt } : {}),
    ...(r.cleaned_by_id ? { cleanedById: r.cleaned_by_id } : {}),
    ...(cleanedBy ? { cleanedBy } : {}),
    ...(r.after_path ? { afterUrl: publicUrl(client, r.after_path) } : {}),
    ...(r.haul_path ? { haulUrl: publicUrl(client, r.haul_path) } : {}),
  };
}

const NETWORK = /network request failed|failed to fetch|network error|load failed/i;

/**
 * Loading the list, quietly: the Cleanups tab shows what went wrong, so
 * nothing is logged as an error (it runs in the background on every launch).
 */
export async function listCleanups(
  client: SupabaseClient,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<CleanupTask[]> {
  try {
    return await withDeadline(async (signal) => {
      const { data, error } = await client
        .from('cleanup_tasks_api')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(CLEANUP_LIST_LIMIT)
        .retry(false)
        .abortSignal(signal);
      if (error) throw error;
      return (Array.isArray(data) ? data : []).flatMap((row) => toCleanup(client, row) ?? []);
    }, timeoutMs);
  } catch (error) {
    if (error instanceof DeadlineError) {
      throw new CommunityError('The server took too long to answer. Try again.', 'timeout');
    }
    const message = describeError(error && typeof error === 'object' && 'message' in error ? error.message : error);
    if (NETWORK.test(message)) throw new CommunityError("You're offline. Try again when you have signal.", 'offline');
    log.info('Could not load cleanups', { error: message });
    throw new CommunityError("Couldn't load cleanups. Please try again.", 'server');
  }
}

/** One cleanup, or null if it isn't there (or this camper can't see it). */
export function getCleanup(
  client: SupabaseClient,
  id: string,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<CleanupTask | null> {
  return withTimeout(
    async (signal) => {
      const { data, error } = await client
        .from('cleanup_tasks_api')
        .select('*')
        .eq('id', id)
        .retry(false)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return data == null ? null : toCleanup(client, data);
    },
    timeoutMs,
    "Couldn't load the cleanup.",
  );
}

export interface NewCleanup {
  /** Picked by the app once per cleanup (the before photo's name too), so a retry never posts it twice. */
  id: string;
  userId: string;
  photo: PreparedPhoto;
  /** Where the camper stood when they took the photo. */
  at: Coordinates;
  kind: CleanupKind;
  size: CleanupSize;
  note?: string;
  /** A spot within 2 km, if there's one. */
  spotId?: string;
}

/** Uploads the before photo, then posts the cleanup. */
export function postCleanup(
  client: SupabaseClient,
  { id, userId, photo, at, kind, size, note = '', spotId }: NewCleanup,
  readBytes: (uri: string) => Promise<ArrayBuffer>,
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<CleanupTask> {
  const path = `${userId}/${id}.jpg`;
  const text = note.trim().slice(0, MAX_CLEANUP_NOTE);
  return withTimeout(
    async (signal) => {
      const insert = () =>
        client
          .from('cleanup_tasks')
          .insert({
            id,
            location: pointText(at),
            kind,
            size,
            before_path: path,
            ...(text ? { note: text } : {}),
            ...(spotId ? { spot_id: spotId } : {}),
          })
          .retry(false)
          .abortSignal(signal);
      await uploadPhotoFile(client, path, photo, readBytes, insert);
      const { error } = await insert();
      if (error && error.code !== '23505') {
        await removeRefusedFiles(client, error, signal, [path]);
        throw error;
      }
      const { data, error: readError } = await client
        .from('cleanup_tasks_api')
        .select('*')
        .eq('id', id)
        .retry(false)
        .abortSignal(signal)
        .single();
      if (readError) throw readError;
      const posted = toCleanup(client, data);
      if (!posted)
        throw new CommunityError('Your cleanup was posted, but it could not be shown. Reopen Cleanups.', 'server');
      return posted;
    },
    timeoutMs,
    "Couldn't post the cleanup.",
  );
}

/** Deletes a cleanup this camper posted (and its photo), while nobody has acted on it. */
export function deleteCleanup(
  client: SupabaseClient,
  task: Pick<CleanupTask, 'id' | 'beforePath'>,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<void> {
  return withTimeout(
    async (signal) => {
      const { data, error } = await client
        .from('cleanup_tasks')
        .delete()
        .eq('id', task.id)
        .select('id')
        .retry(false)
        .abortSignal(signal);
      if (error) throw error;
      if (!Array.isArray(data) || data.length === 0) {
        throw new CommunityError(
          "This cleanup can't be deleted now: someone has sent a cleanup of it, or reported it.",
          'invalid',
        );
      }
      const removed = await client.storage
        .from(PHOTO_BUCKET)
        .remove(withPreviews([task.beforePath]))
        .catch((e: unknown) => ({ error: e }));
      if (removed.error) log.warn('Could not delete a cleanup photo file', { error: describeError(removed.error) });
    },
    timeoutMs,
    "Couldn't delete the cleanup.",
  );
}

// --- Cleaning one up ----------------------------------------------------------------

export interface CleanupTry {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  /** Why a moderator sent it back. */
  reviewNote?: string;
  createdAt: string;
}

const tryRowSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'approved', 'rejected']),
  review_note: z.string().nullable(),
  created_at: z.string(),
});

/** What this camper has sent for a cleanup, oldest first. */
export function myTries(
  client: SupabaseClient,
  taskId: string,
  camperId: string,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<CleanupTry[]> {
  return withTimeout(
    async (signal) => {
      const { data, error } = await client
        .from('cleanup_completions')
        .select('id, status, review_note, created_at')
        .eq('task_id', taskId)
        .eq('camper_id', camperId)
        .order('created_at')
        .retry(false)
        .abortSignal(signal);
      if (error) throw error;
      return (Array.isArray(data) ? data : []).flatMap((row) => {
        const parsed = tryRowSchema.safeParse(row);
        if (!parsed.success) return [];
        const note = clean(parsed.data.review_note, 300);
        return [
          {
            id: parsed.data.id,
            status: parsed.data.status,
            ...(note ? { reviewNote: note } : {}),
            createdAt: toIsoTime(parsed.data.created_at) ?? parsed.data.created_at,
          },
        ];
      });
    },
    timeoutMs,
    "Couldn't check what you sent.",
  );
}

export interface SentCleanup {
  /** Picked by the app once per try (the after photo's name too). */
  id: string;
  /** The haul shot's name, picked with it. */
  haulId: string;
  userId: string;
  taskId: string;
  after: PreparedPhoto;
  haul: PreparedPhoto;
  /** Where the camper stood for the after photo. */
  at: Fix;
  note?: string;
}

/** Uploads the after photo and haul shot, then sends the cleanup for review. */
export function sendCleanup(
  client: SupabaseClient,
  { id, haulId, userId, taskId, after, haul, at, note = '' }: SentCleanup,
  readBytes: (uri: string) => Promise<ArrayBuffer>,
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<void> {
  const afterPath = `${userId}/${id}.jpg`;
  const haulPath = `${userId}/${haulId}.jpg`;
  const text = note.trim().slice(0, MAX_CLEANUP_NOTE);
  const accuracy = at.accuracy != null && Number.isFinite(at.accuracy) && at.accuracy >= 0 ? at.accuracy : null;
  return withTimeout(
    async (signal) => {
      const insert = () =>
        client
          .from('cleanup_completions')
          .insert({
            id,
            task_id: taskId,
            after_path: afterPath,
            haul_path: haulPath,
            location: pointText(at),
            ...(accuracy != null ? { accuracy_m: Math.round(accuracy) } : {}),
            ...(text ? { note: text } : {}),
          })
          .retry(false)
          .abortSignal(signal);
      await uploadPhotoFile(client, afterPath, after, readBytes, insert);
      try {
        await uploadPhotoFile(client, haulPath, haul, readBytes, insert);
      } catch (error) {
        // Refused (not lost): the after photo it uploaded goes too.
        if (error instanceof CommunityError && !signal.aborted) {
          await client.storage
            .from(PHOTO_BUCKET)
            .remove(withPreviews([afterPath]))
            .catch(() => undefined);
        }
        throw error;
      }
      const { error } = await insert();
      if (error && error.code !== '23505') {
        await removeRefusedFiles(client, error, signal, [afterPath, haulPath]);
        throw error;
      }
    },
    timeoutMs,
    "Couldn't send your cleanup.",
  );
}

// --- Review (moderators) -------------------------------------------------------------

/** Is the signed-in camper a moderator? Null when it can't tell (offline, say). */
export async function amModerator(
  client: SupabaseClient,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<boolean | null> {
  try {
    return await withDeadline(async (signal) => {
      const { data, error } = await client.rpc('am_moderator').retry(false).abortSignal(signal);
      if (error) throw error;
      return data === true;
    }, timeoutMs);
  } catch (error) {
    log.info('Could not check moderator status', { error: describeError(error) });
    return null;
  }
}

export interface ReviewItem {
  completionId: string;
  taskId: string;
  kind: CleanupKind;
  /** The size the camper who posted it chose. */
  taskSize: CleanupSize;
  taskNote?: string;
  beforeUrl: string;
  afterUrl: string;
  haulUrl: string;
  note?: string;
  camperId?: string;
  camperName?: string;
  /** When the camper who cleaned it up joined, and how many cleanups of theirs were approved. */
  camperJoined?: string;
  camperApproved: number;
  postedById?: string;
  postedByName?: string;
  spotId?: string;
  spotName?: string;
  /** From the cleanup's pin to where the after photo was taken. */
  distanceM: number | null;
  accuracyM: number | null;
  /** This camper's tries at this cleanup, this one included. */
  tries: number;
  taskCreatedAt: string;
  sentAt: string;
}

const count = z.coerce.number().int().nonnegative();

const reviewRowSchema = z.object({
  completion_id: z.string().uuid(),
  task_id: z.string().uuid(),
  kind: z.enum(['litter', 'fire_ring', 'dumping', 'other']),
  task_size: z.enum(['small', 'medium', 'large']),
  task_note: z.string().nullable(),
  before_path: z.string().regex(PHOTO_PATH),
  after_path: z.string().regex(PHOTO_PATH),
  haul_path: z.string().regex(PHOTO_PATH),
  note: z.string().nullable(),
  camper_id: z.string().uuid().nullable(),
  camper_name: z.string().nullable(),
  camper_joined: z.string().nullable(),
  camper_approved: count,
  posted_by: z.string().uuid().nullable(),
  posted_by_name: z.string().nullable(),
  spot_id: z.string().nullable(),
  spot_name: z.string().nullable(),
  distance_m: z.number().nullable(),
  accuracy_m: z.number().nullable(),
  tries: count,
  task_created_at: z.string(),
  sent_at: z.string(),
});

/** Cleanups waiting for review, oldest first. */
export function reviewQueue(client: SupabaseClient, timeoutMs: number = REMOTE_TIMEOUT_MS): Promise<ReviewItem[]> {
  return withTimeout(
    async (signal) => {
      const { data, error } = await client.rpc('cleanup_review_queue').retry(false).abortSignal(signal);
      if (error) throw error;
      return (Array.isArray(data) ? data : []).flatMap((row) => {
        const parsed = reviewRowSchema.safeParse(row);
        if (!parsed.success) {
          log.warn('Skipping a cleanup to review that failed validation', {
            issues: parsed.error.issues.slice(0, 3),
          });
          return [];
        }
        const r = parsed.data;
        const taskNote = clean(r.task_note, MAX_CLEANUP_NOTE);
        const note = clean(r.note, MAX_CLEANUP_NOTE);
        const camperName = clean(r.camper_name);
        const postedByName = clean(r.posted_by_name);
        const spotName = clean(r.spot_name, 80);
        return [
          {
            completionId: r.completion_id,
            taskId: r.task_id,
            kind: r.kind,
            taskSize: r.task_size,
            ...(taskNote ? { taskNote } : {}),
            beforeUrl: publicUrl(client, r.before_path),
            afterUrl: publicUrl(client, r.after_path),
            haulUrl: publicUrl(client, r.haul_path),
            ...(note ? { note } : {}),
            ...(r.camper_id ? { camperId: r.camper_id } : {}),
            ...(camperName ? { camperName } : {}),
            ...(r.camper_joined ? { camperJoined: toIsoTime(r.camper_joined) ?? r.camper_joined } : {}),
            camperApproved: r.camper_approved,
            ...(r.posted_by ? { postedById: r.posted_by } : {}),
            ...(postedByName ? { postedByName } : {}),
            ...(r.spot_id ? { spotId: r.spot_id } : {}),
            ...(spotName ? { spotName } : {}),
            distanceM: r.distance_m,
            accuracyM: r.accuracy_m,
            tries: r.tries,
            taskCreatedAt: toIsoTime(r.task_created_at) ?? r.task_created_at,
            sentAt: toIsoTime(r.sent_at) ?? r.sent_at,
          },
        ];
      });
    },
    timeoutMs,
    "Couldn't load cleanups to review.",
  );
}

/** Approves a cleanup at `size`: the cleanup is done, and Embers post. */
export function approveCleanup(
  client: SupabaseClient,
  completionId: string,
  size: CleanupSize,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<void> {
  return withTimeout(
    async (signal) => {
      const { error } = await client
        .rpc('approve_cleanup', { completion: completionId, final_size: size })
        .retry(false)
        .abortSignal(signal);
      if (error) throw error;
    },
    timeoutMs,
    "Couldn't approve the cleanup.",
  );
}

/** Sends a cleanup back with a reason the camper sees. */
export function rejectCleanup(
  client: SupabaseClient,
  completionId: string,
  reason: string,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<void> {
  return withTimeout(
    async (signal) => {
      const { error } = await client
        .rpc('reject_cleanup', { completion: completionId, reason: reason.trim().slice(0, 300) })
        .retry(false)
        .abortSignal(signal);
      if (error) throw error;
    },
    timeoutMs,
    "Couldn't send the cleanup back.",
  );
}

// --- Embers ---------------------------------------------------------------------------

export interface EmberSummary {
  total: number;
  /** Earned today (Mountain time), and today's most. */
  today: number;
  dailyLimit: number | null;
}

const summarySchema = z.object({
  total: z.coerce.number().int(),
  today: z.coerce.number().int(),
  daily_limit: z.coerce.number().int().nullable(),
});

export function myEmbers(client: SupabaseClient, timeoutMs: number = REMOTE_TIMEOUT_MS): Promise<EmberSummary> {
  return withTimeout(
    async (signal) => {
      const { data, error } = await client.rpc('my_embers').retry(false).abortSignal(signal);
      if (error) throw error;
      const parsed = summarySchema.safeParse(Array.isArray(data) ? data[0] : data);
      if (!parsed.success) return { total: 0, today: 0, dailyLimit: null };
      return { total: parsed.data.total, today: parsed.data.today, dailyLimit: parsed.data.daily_limit };
    },
    timeoutMs,
    "Couldn't load your Embers.",
  );
}

export interface EmberEntry {
  id: number;
  reason: EmberReason;
  amount: number;
  /** Before the daily limit (more than amount when the limit cut it). */
  fullAmount: number;
  spotId?: string;
  spotName?: string;
  createdAt: string;
}

const entrySchema = z.object({
  id: z.coerce.number().int(),
  reason: z.enum([
    'cleanup',
    'cleanup_reported',
    'spot_confirmed',
    'still_good',
    'change_report',
    'photo',
    'taken_back',
  ]),
  amount: z.number().int(),
  full_amount: z.number().int(),
  spot_id: z.string().nullable(),
  spot_name: z.string().nullable(),
  created_at: z.string(),
});

/** The camper's latest Embers, newest first. */
export function listEmbers(
  client: SupabaseClient,
  limit = 20,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<EmberEntry[]> {
  return withTimeout(
    async (signal) => {
      const { data, error } = await client
        .from('embers_api')
        .select('*')
        .order('id', { ascending: false })
        .limit(limit)
        .retry(false)
        .abortSignal(signal);
      if (error) throw error;
      return (Array.isArray(data) ? data : []).flatMap((row) => {
        const parsed = entrySchema.safeParse(row);
        if (!parsed.success) return [];
        const r = parsed.data;
        const spotName = clean(r.spot_name, 80);
        return [
          {
            id: r.id,
            reason: r.reason,
            amount: r.amount,
            fullAmount: r.full_amount,
            ...(r.spot_id ? { spotId: r.spot_id } : {}),
            ...(spotName ? { spotName } : {}),
            createdAt: toIsoTime(r.created_at) ?? r.created_at,
          },
        ];
      });
    },
    timeoutMs,
    "Couldn't load your Embers.",
  );
}
