// Key-value storage on the phone, backed by SQLite. Unlike AsyncStorage it
// has no 2 MB per-item limit on Android, so the offline spot cache can grow.
// Tests replace this module with an in-memory version (see __mocks__).

import Storage from 'expo-sqlite/kv-store';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const kvStore: KeyValueStore = {
  getItem: (key) => Storage.getItem(key),
  setItem: (key, value) => Storage.setItem(key, value),
  removeItem: async (key) => {
    await Storage.removeItem(key);
  },
};
