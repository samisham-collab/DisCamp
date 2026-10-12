// State that survives app restarts. Loads once, validates what it reads, and
// saves changes after a short pause (or right away when the app goes to the
// background) so typing doesn't hammer storage.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { z } from 'zod';

import { SAVE_DEBOUNCE_MS } from '../config';
import { readJson, writeJson } from './storage';

type Updater<T> = T | ((prev: T) => T);

/**
 * `schema` and `normalize` must be stable (defined at module level), or the
 * saved value will be re-read on every render.
 */
export function usePersistentState<T>(
  key: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  initial: T,
  normalize: (value: T) => T,
): [value: T, update: (next: Updater<T>) => void, ready: boolean] {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  // Set once the user changes something, so a slow load never overwrites it.
  const touched = useRef(false);
  const pending = useRef<{ value: T } | null>(null);
  // The latest value, and whether the screen holding it is still open: an
  // update that arrives after it closed (a save finishing late) is written
  // straight to storage instead of being lost.
  const latest = useRef(initial);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    // A saved value only replaces the default if the user hasn't changed
    // anything yet, even when a slow read delivers it after start-up.
    const applySaved = (saved: T) => {
      if (active && !touched.current) {
        latest.current = normalize(saved);
        setValue(latest.current);
      }
    };
    void readJson(key, schema, { onLateValue: applySaved })
      .then((saved) => {
        if (saved != null) applySaved(saved);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [key, schema, normalize]);

  useEffect(() => {
    if (!ready || !touched.current) return undefined;
    pending.current = { value };
    const timer = setTimeout(() => {
      const next = pending.current;
      pending.current = null;
      if (next) void writeJson(key, next.value);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, ready, value]);

  // Save right away instead of waiting out the pause when the app is about to
  // be suspended, or when this state goes away (for example, the crash screen
  // replaces the app).
  useEffect(() => {
    const flush = () => {
      const next = pending.current;
      pending.current = null;
      if (next) void writeJson(key, next.value);
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flush();
    });
    return () => {
      subscription.remove();
      flush();
    };
  }, [key]);

  const update = useCallback(
    (next: Updater<T>) => {
      touched.current = true;
      const resolve = (prev: T) => normalize(typeof next === 'function' ? (next as (prev: T) => T)(prev) : next);
      if (!mounted.current) {
        latest.current = resolve(latest.current);
        pending.current = null;
        void writeJson(key, latest.current);
        return;
      }
      setValue((prev) => {
        latest.current = resolve(prev);
        return latest.current;
      });
    },
    [key, normalize],
  );

  return [value, update, ready];
}
