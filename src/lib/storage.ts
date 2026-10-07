// Typed, validated reads and writes on top of kvStore. A failed or invalid
// read returns null and is logged: saved data can never crash the app.

import type { z } from 'zod';

import { STORAGE_TIMEOUT_MS } from '../config';
import { kvStore } from './kvStore';
import { log } from './log';

class StorageTimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms} ms`);
    this.name = 'StorageTimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StorageTimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function parseSaved<T>(key: string, schema: z.ZodType<T>, raw: string | null): T | null {
  if (raw == null) return null;

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    log.warn('Ignoring saved data that is not valid JSON', { key, error: String(error) });
    return null;
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    log.warn('Ignoring saved data in an unexpected shape', { key, issues: parsed.error.issues.slice(0, 3) });
    return null;
  }
  return parsed.data;
}

export interface ReadOptions<T> {
  /**
   * Storage can be slow on a cold start. If a read takes longer than the
   * timeout, readJson resolves null so the app can start, and this is called
   * if the saved value turns up afterwards.
   */
  onLateValue?: (value: T) => void;
}

export async function readJson<T>(key: string, schema: z.ZodType<T>, options: ReadOptions<T> = {}): Promise<T | null> {
  let read: Promise<string | null> | undefined;
  let raw: string | null;
  try {
    read = kvStore.getItem(key);
    raw = await withTimeout(read, STORAGE_TIMEOUT_MS);
  } catch (error) {
    log.error('Could not read saved data', error, { key });
    const { onLateValue } = options;
    if (error instanceof StorageTimeoutError && read && onLateValue) {
      read.then(
        (lateRaw) => {
          const late = parseSaved(key, schema, lateRaw);
          if (late != null) onLateValue(late);
        },
        () => undefined, // Already reported as a failed read.
      );
    }
    return null;
  }
  return parseSaved(key, schema, raw);
}

/** Saves a value; returns false (and logs) instead of throwing on failure. */
export async function writeJson(key: string, value: unknown): Promise<boolean> {
  try {
    await withTimeout(kvStore.setItem(key, JSON.stringify(value)), STORAGE_TIMEOUT_MS);
    return true;
  } catch (error) {
    log.error('Could not save data', error, { key });
    return false;
  }
}
