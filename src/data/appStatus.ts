// Staying on Supabase's free plan (migration 0011). Near the plan's storage
// limit, new photos pause; near its database limit (or when a moderator
// pauses them by hand), new posts pause. Nothing is deleted. The app asks
// public.app_status() so posting screens can say so before a camper tries,
// and moderators see the numbers on the Review tab (public.free_plan_usage).

import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { REMOTE_TIMEOUT_MS } from '../config';
import { withDeadline } from '../lib/deadline';
import { describeError, log } from '../lib/log';

/** When DisCamp is near its storage limit and new photos (and cleanups) wait. */
export const PHOTOS_PAUSED_MESSAGE =
  'New photos are paused for now while DisCamp makes room. Spots, check-ins and reports still work.';
/** When new posts wait (DisCamp is near its database limit, or a moderator paused them). */
export const POSTING_PAUSED_MESSAGE =
  'New spots, photos and check-ins are paused for now. Reports still work. Please try again later.';

export type UsageLevel = 'ok' | 'warn' | 'paused';

export interface AppStatus {
  photosPaused: boolean;
  postingPaused: boolean;
  level: UsageLevel;
}

/** What the app assumes until it hears otherwise: nothing paused. The database decides anyway. */
export const OPEN_STATUS: AppStatus = { photosPaused: false, postingPaused: false, level: 'ok' };

const levelSchema = z.enum(['ok', 'warn', 'paused']);

const statusSchema = z.object({
  photos_paused: z.boolean(),
  posting_paused: z.boolean(),
  level: levelSchema,
});

/** How long an answer stays good: a pause lasts days, so there's no need to ask often. */
export const STATUS_MAX_AGE_MS = 10 * 60 * 1000;

/** Asks whether photos or posting are paused. Null if it couldn't tell (offline, say). */
export async function fetchAppStatus(
  client: SupabaseClient,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<AppStatus | null> {
  try {
    return await withDeadline(async (signal) => {
      const { data, error } = await client.rpc('app_status').retry(false).abortSignal(signal);
      if (error) throw error;
      const parsed = statusSchema.parse(data);
      return {
        photosPaused: parsed.photos_paused,
        postingPaused: parsed.posting_paused,
        level: parsed.level,
      };
    }, timeoutMs);
  } catch (error) {
    // Quiet: posting screens ask on every visit, and the database checks anyway.
    log.info('Could not check whether posting is paused', { error: describeError(error) });
    return null;
  }
}

// The last answer, per client (so tests, which each make one, never share it).
const answers = new WeakMap<SupabaseClient, { at: number; status: AppStatus }>();

/** Whether photos or posting are paused, asked at most every 10 minutes. */
export function useAppStatus(client: SupabaseClient | null | undefined): AppStatus {
  // Bumped when a fresh answer arrives, so the screen shows it.
  const [, setAnswered] = useState(0);

  useEffect(() => {
    if (!client) return undefined;
    const known = answers.get(client);
    if (known && Date.now() - known.at < STATUS_MAX_AGE_MS) return undefined;
    let active = true;
    void fetchAppStatus(client).then((answer) => {
      if (!answer) return;
      answers.set(client, { at: Date.now(), status: answer });
      if (active) setAnswered((n) => n + 1);
    });
    return () => {
      active = false;
    };
  }, [client]);

  return (client && answers.get(client)?.status) || OPEN_STATUS;
}

// --- The numbers, for moderators -------------------------------------------------

const bytes = z.coerce.number().nonnegative();
const count = z.coerce.number().int().nonnegative();

const usageSchema = z.object({
  database_bytes: bytes,
  database_limit_bytes: bytes,
  storage_bytes: bytes,
  storage_limit_bytes: bytes,
  pause_at_percent: count,
  warn_at_percent: count,
  photos_paused: z.boolean(),
  posting_paused: z.boolean(),
  level: levelSchema,
  files: count,
  spots: count,
  photos: count,
  checkins: count,
  cleanups: count,
  campers: count,
  active_campers: count,
  checked_at: z.string(),
  month_ago: z.object({ day: z.string(), database_bytes: bytes, storage_bytes: bytes }).nullable().optional(),
});

export interface FreePlanUsage extends AppStatus {
  databaseBytes: number;
  databaseLimitBytes: number;
  storageBytes: number;
  storageLimitBytes: number;
  pauseAtPercent: number;
  warnAtPercent: number;
  files: number;
  spots: number;
  photos: number;
  checkins: number;
  cleanups: number;
  campers: number;
  /** Signed in during the last 30 days. */
  activeCampers: number;
  checkedAt: string;
  /** About a month ago, when there's a record that old. */
  monthAgo?: { day: string; databaseBytes: number; storageBytes: number };
}

/** The free plan's numbers (moderators only). Null if they couldn't be read. */
export async function fetchFreePlanUsage(
  client: SupabaseClient,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<FreePlanUsage | null> {
  try {
    return await withDeadline(async (signal) => {
      const { data, error } = await client.rpc('free_plan_usage').retry(false).abortSignal(signal);
      if (error) throw error;
      const u = usageSchema.parse(data);
      return {
        photosPaused: u.photos_paused,
        postingPaused: u.posting_paused,
        level: u.level,
        databaseBytes: u.database_bytes,
        databaseLimitBytes: u.database_limit_bytes,
        storageBytes: u.storage_bytes,
        storageLimitBytes: u.storage_limit_bytes,
        pauseAtPercent: u.pause_at_percent,
        warnAtPercent: u.warn_at_percent,
        files: u.files,
        spots: u.spots,
        photos: u.photos,
        checkins: u.checkins,
        cleanups: u.cleanups,
        campers: u.campers,
        activeCampers: u.active_campers,
        checkedAt: u.checked_at,
        ...(u.month_ago
          ? {
              monthAgo: {
                day: u.month_ago.day,
                databaseBytes: u.month_ago.database_bytes,
                storageBytes: u.month_ago.storage_bytes,
              },
            }
          : {}),
      };
    }, timeoutMs);
  } catch (error) {
    log.info('Could not read free plan usage', { error: describeError(error) });
    return null;
  }
}

/** "140 MB", "1 GB", "512 KB". */
export function formatBytes(n: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB'] as const;
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} bytes`;
  const shown = value < 10 && !Number.isInteger(value) ? value.toFixed(1) : String(Math.round(value));
  return `${shown} ${units[unit]}`;
}

/** Whole percent of a limit used, 0 to 100 (or more, past it). */
export function percentOf(used: number, limit: number): number {
  return limit > 0 ? Math.floor((used / limit) * 100) : 0;
}
