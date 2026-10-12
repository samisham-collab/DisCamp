// Getting spots in and out: the server (Supabase) and the offline cache.
// No React here, so every path can be unit tested.

import type { SupabaseClient } from '@supabase/supabase-js';

import { SERVER_ROW_LIMIT, STORAGE_KEYS } from '../config';
import { DeadlineError, withDeadline } from '../lib/deadline';
import { log } from '../lib/log';
import { cachedSpotsSchema, spotRowSchema, type CachedSpots } from '../lib/schemas';
import { readJson, writeJson } from '../lib/storage';
import type { Spot } from '../types';

export class SpotsLoadError extends Error {
  constructor(
    message: string,
    readonly kind: 'offline' | 'timeout' | 'server',
  ) {
    super(message);
    this.name = 'SpotsLoadError';
  }
}

export interface ParsedSpots {
  spots: Spot[];
  /** Rows that failed validation and were left out. */
  skipped: number;
}

/** Validates server rows one by one; a bad row is skipped, never fatal. */
export function parseSpotRows(rows: readonly unknown[]): ParsedSpots {
  const spots: Spot[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const row of rows) {
    const parsed = spotRowSchema.safeParse(row);
    if (!parsed.success) {
      skipped += 1;
      const id = typeof row === 'object' && row !== null && 'id' in row ? String(row.id) : 'unknown';
      log.warn('Skipping a spot that failed validation', { id, issues: parsed.error.issues.slice(0, 3) });
      continue;
    }
    if (seen.has(parsed.data.id)) {
      skipped += 1;
      log.warn('Skipping a duplicate spot id', { id: parsed.data.id });
      continue;
    }
    seen.add(parsed.data.id);
    spots.push(parsed.data);
  }
  return { spots, skipped };
}

function isNetworkError(message: string): boolean {
  return /network request failed|failed to fetch|network error|load failed/i.test(message);
}

export async function fetchRemoteSpots(client: SupabaseClient, timeoutMs: number): Promise<ParsedSpots> {
  try {
    // One attempt, bounded by our own timeout. The library's automatic retries
    // (1 s, 2 s, 4 s apart) would keep campers waiting ~7 s just to learn
    // they're offline; Retry and pull-to-refresh try again on request.
    const { data, error } = await withDeadline(
      async (signal) => client.from('spots_api').select('*').order('name').retry(false).abortSignal(signal),
      timeoutMs,
    );
    if (error) {
      if (isNetworkError(error.message)) {
        throw new SpotsLoadError("You're offline or the server can't be reached.", 'offline');
      }
      log.warn('Supabase returned an error', { message: error.message, code: error.code });
      throw new SpotsLoadError("The server couldn't send spots right now.", 'server');
    }
    const rows: unknown[] = Array.isArray(data) ? data : [];
    if (rows.length >= SERVER_ROW_LIMIT) {
      log.warn('The server sent its maximum number of spots; some may be missing', { rows: rows.length });
    }
    return parseSpotRows(rows);
  } catch (error) {
    if (error instanceof SpotsLoadError) throw error;
    if (error instanceof DeadlineError) throw new SpotsLoadError('The server took too long to respond.', 'timeout');
    const message = error instanceof Error ? error.message : String(error);
    if (isNetworkError(message)) throw new SpotsLoadError("You're offline or the server can't be reached.", 'offline');
    log.error('Unexpected error loading spots', error);
    throw new SpotsLoadError("The server couldn't send spots right now.", 'server');
  }
}

export function loadCachedSpots(): Promise<CachedSpots | null> {
  return readJson(STORAGE_KEYS.spotsCache, cachedSpotsSchema);
}

export function saveCachedSpots(spots: Spot[], now: Date = new Date()): Promise<boolean> {
  const payload: CachedSpots = { version: 1, savedAt: now.toISOString(), spots };
  return writeJson(STORAGE_KEYS.spotsCache, payload);
}
