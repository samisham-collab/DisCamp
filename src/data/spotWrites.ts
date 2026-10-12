// Adding, editing and deleting spots on the server. The database decides who
// may change what (migration 0003); this file turns its answers into plain
// messages. No React here, so every path can be unit tested.

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';

import { REMOTE_TIMEOUT_MS } from '../config';
import { DeadlineError, withDeadline } from '../lib/deadline';
import { describeError, log } from '../lib/log';
import { bannedMessage } from './moderation';
import type { SpotInput } from '../lib/spotDraft';
import { spotRowSchema } from '../lib/schemas';
import type { Spot } from '../types';

export type SpotWriteErrorKind =
  'offline' | 'timeout' | 'signed-out' | 'not-allowed' | 'limit' | 'invalid' | 'banned' | 'terms' | 'server';

export class SpotWriteError extends Error {
  constructor(
    message: string,
    readonly kind: SpotWriteErrorKind,
  ) {
    super(message);
    this.name = 'SpotWriteError';
  }
}

type PostgrestErrorLike = { message: string; code?: string; details?: string | null; hint?: string | null };

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** A spot as the database's columns. Only the fields campers may write. */
export function toSpotRow(input: SpotInput): Record<string, unknown> {
  return {
    name: input.name,
    // PostGIS reads "SRID=4326;POINT(longitude latitude)": longitude first.
    location: `SRID=4326;POINT(${round6(input.longitude)} ${round6(input.latitude)})`,
    site_type: input.siteType,
    land_manager: input.landManager,
    stay_limit_days: input.stayLimitDays,
    clearance_tier: input.access.clearanceTier,
    drivetrain: input.access.drivetrain,
    surface: input.access.surface,
    impassable_when_wet: input.access.impassableWhenWet,
    tent: input.fit.tent,
    rtt: input.fit.rtt,
    van: input.fit.van,
    max_trailer_ft: input.fit.maxTrailerFt,
    big_rig: input.fit.bigRig,
    turnaround: input.fit.turnaround,
    nightly_fee_usd: input.cost.nightlyFeeUsd,
    rv_fee_usd: input.cost.rvFeeUsd,
    hookups: input.cost.hookups,
    reservations: input.cost.reservations,
    cost_notes: input.cost.notes ?? null,
    amenities: input.amenities,
    rules: input.rules,
    directions: input.directions ?? null,
    phone: input.phone ?? null,
  };
}

const NETWORK = /network request failed|failed to fetch|network error|load failed/i;

/** Turns what the server or the network said into something a camper can act on. */
export function toWriteError(error: unknown, action: 'save' | 'delete'): SpotWriteError {
  if (error instanceof SpotWriteError) return error;
  const e: PostgrestErrorLike =
    error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? (error as PostgrestErrorLike)
      : { message: describeError(error) };

  if (NETWORK.test(e.message)) {
    return new SpotWriteError(
      action === 'save'
        ? "You're offline. Your changes are still here; try again when you have signal."
        : "You're offline. Try again when you have signal.",
      'offline',
    );
  }
  if (e.message === 'daily_limit') {
    return new SpotWriteError('You can add up to 20 spots a day. Try again tomorrow.', 'limit');
  }
  // Moderation (migration 0004).
  if (e.message === 'banned') return new SpotWriteError(bannedMessage(), 'banned');
  if (e.message === 'terms_required') {
    return new SpotWriteError(
      'Agree to the DisCamp terms of use first. If you already have, update DisCamp to see the latest terms.',
      'terms',
    );
  }
  if (e.message === 'blocked_words') {
    return new SpotWriteError("Some words aren't allowed on DisCamp. Change them, then try again.", 'invalid');
  }
  // 42501 ("permission denied"): the request arrived without a signed-in
  // camper, usually because the sign-in expired and couldn't be renewed.
  // (Someone else's spot doesn't error; it just isn't changed. See below.)
  if (
    e.code === 'PGRST301' ||
    e.code === 'PGRST303' ||
    e.code === '42501' ||
    /jwt|not authenticated/i.test(e.message)
  ) {
    return new SpotWriteError('Your sign-in has expired. Sign in again, then try again.', 'signed-out');
  }
  if (e.code && /^(23|22)/.test(e.code)) {
    log.warn('The server rejected a spot', { code: e.code, message: e.message, details: e.details });
    return new SpotWriteError("The server didn't accept some details. Check the form and try again.", 'invalid');
  }
  log.error(`Could not ${action} a spot`, error);
  return new SpotWriteError(
    action === 'save' ? "Couldn't save the spot. Please try again." : "Couldn't delete the spot. Please try again.",
    'server',
  );
}

/** Runs one request with a time limit and no hidden retries. */
async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number, action: 'save' | 'delete') {
  try {
    return await withDeadline(run, timeoutMs);
  } catch (error) {
    if (error instanceof DeadlineError) {
      throw new SpotWriteError('The server took too long to answer. Try again.', 'timeout');
    }
    throw toWriteError(error, action);
  }
}

/** Whether the map (as this camper sees it) still has a spot with this id. */
async function spotExists(client: SupabaseClient, id: string, signal: AbortSignal): Promise<boolean> {
  const { data, error } = await client
    .from('spots_api')
    .select('id')
    .eq('id', id)
    .retry(false)
    .abortSignal(signal)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

/** Reads one spot back the way the map does, so it shows exactly as everyone sees it. */
async function readSpot(
  client: SupabaseClient,
  id: string,
  signal: AbortSignal,
  unreadable = 'The spot was saved, but it could not be shown. Pull down to refresh.',
): Promise<Spot> {
  const { data, error } = await client
    .from('spots_api')
    .select('*')
    .eq('id', id)
    .retry(false)
    .abortSignal(signal)
    .single();
  if (error) throw error;
  const parsed = spotRowSchema.safeParse(data);
  if (!parsed.success) {
    log.warn('A saved spot came back in an unexpected shape', { id, issues: parsed.error.issues.slice(0, 3) });
    throw new SpotWriteError(unreadable, 'server');
  }
  return parsed.data;
}

/**
 * Adds a spot. `id` is a UUID the app picks once per draft and reuses on
 * every try, so if a connection drops after the server saved the spot,
 * trying again finds it instead of adding it twice.
 */
export function createSpot(
  client: SupabaseClient,
  input: SpotInput,
  id: string,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
  newId: () => string = Crypto.randomUUID,
): Promise<Spot> {
  return withTimeout(
    async (signal) => {
      const row = toSpotRow(input);
      const insert = (spotId: string) =>
        client
          .from('spots')
          .insert({ id: spotId, ...row })
          .select('id')
          .retry(false)
          .abortSignal(signal)
          .single();
      let savedId = id;
      const { error } = await insert(id);
      // A spot with this id may exist already: an earlier try saved it even
      // though its answer never arrived. The database answers 23505 for that,
      // or "daily_limit" when that earlier spot was the day's 20th. Either
      // way, bring that spot up to date with this try.
      if (error?.code === '23505' || error?.message === 'daily_limit') {
        const { data, error: updateError } = await client
          .from('spots')
          .update(row)
          .eq('id', id)
          .select('id')
          .retry(false)
          .abortSignal(signal);
        if (updateError) throw updateError;
        if (!Array.isArray(data) || data.length === 0) {
          // Not this camper's spot after all (say, a draft left on a shared
          // phone by someone else): really over the limit, or add it anew.
          if (error.code !== '23505') throw error;
          savedId = newId();
          const { error: retryError } = await insert(savedId);
          if (retryError) throw retryError;
        }
      } else if (error) {
        throw error;
      }
      return readSpot(
        client,
        savedId,
        signal,
        'Your spot was saved, but it could not be loaded. Pull down on the map to refresh.',
      );
    },
    timeoutMs,
    'save',
  );
}

export function updateSpot(
  client: SupabaseClient,
  id: string,
  input: SpotInput,
  timeoutMs: number = REMOTE_TIMEOUT_MS,
): Promise<Spot> {
  return withTimeout(
    async (signal) => {
      const { data, error } = await client
        .from('spots')
        .update(toSpotRow(input))
        .eq('id', id)
        .select('id')
        .retry(false)
        .abortSignal(signal);
      if (error) throw error;
      // Row-level security hides spots you didn't add: nothing was changed.
      if (!Array.isArray(data) || data.length === 0) {
        throw new SpotWriteError('You can only change spots you added.', 'not-allowed');
      }
      return readSpot(client, id, signal);
    },
    timeoutMs,
    'save',
  );
}

export function deleteSpot(client: SupabaseClient, id: string, timeoutMs: number = REMOTE_TIMEOUT_MS): Promise<void> {
  return withTimeout(
    async (signal) => {
      const { data, error } = await client
        .from('spots')
        .delete()
        .eq('id', id)
        .select('id')
        .retry(false)
        .abortSignal(signal);
      if (error) throw error;
      if (!Array.isArray(data) || data.length === 0) {
        // Already gone: an earlier try deleted it, but its answer was lost.
        if (!(await spotExists(client, id, signal))) return;
        throw new SpotWriteError(
          "This spot can't be deleted: it's being reviewed after reports, other campers have reported on it, or it isn't yours. You can still edit it.",
          'not-allowed',
        );
      }
    },
    timeoutMs,
    'delete',
  );
}
