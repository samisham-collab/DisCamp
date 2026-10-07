// In-memory storage for tests. jest.setup.ts swaps it in for every test.

import type { KeyValueStore } from '../kvStore';

const memory = new Map<string, string>();

export const kvStore: KeyValueStore & { reset(): void; dump(): Record<string, string> } = {
  getItem: async (key) => memory.get(key) ?? null,
  setItem: async (key, value) => {
    memory.set(key, value);
  },
  removeItem: async (key) => {
    memory.delete(key);
  },
  reset: () => memory.clear(),
  dump: () => Object.fromEntries(memory),
};
