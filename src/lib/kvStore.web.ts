// Browser preview: the browser's localStorage stands in for SQLite.

import type { KeyValueStore } from './kvStore';

export type { KeyValueStore } from './kvStore';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const kvStore: KeyValueStore = {
  getItem: async (key) => storage()?.getItem(key) ?? null,
  setItem: async (key, value) => {
    storage()?.setItem(key, value);
  },
  removeItem: async (key) => {
    storage()?.removeItem(key);
  },
};
