// Runs before every test file: swaps native modules for predictable fakes.

import { afterEach, beforeEach, jest } from '@jest/globals';
import { format } from 'util';

import type { kvStore as MemoryKvStore } from '@/lib/__mocks__/kvStore';

// Phone storage → in-memory map (src/lib/__mocks__/kvStore.ts).
jest.mock('@/lib/kvStore', () => jest.requireActual('@/lib/__mocks__/kvStore'));

// No server by default; tests that need one pass a fake client to SpotsProvider.
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: jest.fn(() => false),
  getSupabase: jest.fn(() => null),
}));

jest.mock('react-native-maps', () => jest.requireActual('./test/mocks/reactNativeMaps'));
jest.mock('expo-location', () => jest.requireActual('./test/mocks/expoLocation'));
jest.mock('expo-secure-store', () => jest.requireActual('./test/mocks/expoSecureStore'));
jest.mock('expo-web-browser', () => jest.requireActual('./test/mocks/expoWebBrowser'));
jest.mock('expo-apple-authentication', () => jest.requireActual('./test/mocks/expoAppleAuthentication'));
jest.mock('expo-crypto', () => jest.requireActual('./test/mocks/expoCrypto'));
// Expo builds sign-in redirect links from app.json, which tests don't load.
jest.mock('expo-linking', () => ({
  ...jest.requireActual<Record<string, unknown>>('expo-linking'),
  createURL: jest.fn((path: string) => `discamp://${path}`),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
  setOptions: jest.fn(),
}));
// Icon fonts count as already loaded, so icons render in one pass instead of
// updating after the test has moved on (which React reports as an act() warning).
jest.mock('expo-font', () => ({
  ...jest.requireActual<Record<string, unknown>>('expo-font'),
  isLoaded: jest.fn(() => true),
  loadAsync: jest.fn(() => Promise.resolve()),
}));

// A console.error or console.warn that a test didn't ask for fails that test,
// so React warnings (act(), duplicate keys, bad props) can't slip in unnoticed.
// Tests that expect a log silence it with jest.spyOn(console, 'error').mockImplementation(...).
const realConsole = { error: console.error, warn: console.warn };
const unexpectedLogs: string[] = [];

beforeEach(() => {
  const { kvStore } = jest.requireMock<{ kvStore: typeof MemoryKvStore }>('@/lib/kvStore');
  kvStore.reset();
  jest.requireMock<{ store: Map<string, string> }>('expo-secure-store').store.clear();

  unexpectedLogs.length = 0;
  for (const level of ['error', 'warn'] as const) {
    console[level] = (...args: unknown[]) => {
      unexpectedLogs.push(`console.${level}: ${format(...args)}`);
      realConsole[level](...args);
    };
  }
});

afterEach(() => {
  jest.clearAllMocks();
  if (unexpectedLogs.length > 0) {
    const logs = unexpectedLogs.splice(0);
    throw new Error(`Unexpected console output during this test:\n${logs.join('\n')}`);
  }
});
