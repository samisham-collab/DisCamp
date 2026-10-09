// Test stand-in for expo-secure-store: an in-memory keychain.

import { jest } from '@jest/globals';

export const store = new Map<string, string>();

export const AFTER_FIRST_UNLOCK = 0;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;
export const WHEN_UNLOCKED = 5;

export const getItemAsync = jest.fn(async (key: string) => store.get(key) ?? null);
export const setItemAsync = jest.fn(async (key: string, value: string) => {
  if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`Invalid key: ${key}`);
  store.set(key, value);
});
export const deleteItemAsync = jest.fn(async (key: string) => {
  store.delete(key);
});
