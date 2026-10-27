// The real Supabase module (jest.setup.ts mocks it for every other test).

import { afterEach, describe, expect, it, jest } from '@jest/globals';

import type * as SecureStorageExports from '@/lib/secureStorage';
import type * as SupabaseExports from '@/lib/supabase';

jest.unmock('@/lib/supabase');

type SupabaseModule = typeof SupabaseExports;

function loadWith(env: Record<string, string | undefined>): SupabaseModule {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key];
  let mod: SupabaseModule | undefined;
  jest.isolateModules(() => {
    mod = jest.requireActual<SupabaseModule>('@/lib/supabase');
  });
  process.env = saved;
  if (!mod) throw new Error('module did not load');
  return mod;
}

describe('getSupabase', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null when the app is not configured for a server', () => {
    const mod = loadWith({ EXPO_PUBLIC_SUPABASE_URL: undefined, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined });
    expect(mod.isSupabaseConfigured()).toBe(false);
    expect(mod.getSupabase()).toBeNull();
  });

  it('creates one client and reuses it', () => {
    const mod = loadWith({
      EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    });
    expect(mod.isSupabaseConfigured()).toBe(true);
    const client = mod.getSupabase();
    expect(client).not.toBeNull();
    expect(mod.getSupabase()).toBe(client);
  });

  it('falls back to starter spots when the URL is invalid', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const mod = loadWith({
      EXPO_PUBLIC_SUPABASE_URL: 'not a url',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    });
    expect(mod.getSupabase()).toBeNull();
  });

  it('reads and forgets the sign-in saved on this phone', async () => {
    const saved = { ...process.env };
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcd1234.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    let mod: SupabaseModule | undefined;
    let storage: (typeof SecureStorageExports)['secureSessionStorage'] | undefined;
    jest.isolateModules(() => {
      mod = jest.requireActual<SupabaseModule>('@/lib/supabase');
      storage = jest.requireActual<typeof SecureStorageExports>('@/lib/secureStorage').secureSessionStorage;
    });
    process.env = saved;
    if (!mod || !storage) throw new Error('module did not load');
    const key = 'sb-abcd1234-auth-token';

    expect(await mod.readSavedSession()).toBeNull();
    const session = { access_token: 'a', refresh_token: 'r', user: { id: 'u1', email: 'sam@example.com' } };
    await storage.setItem(key, JSON.stringify(session));
    expect(await mod.readSavedSession()).toEqual(session);
    // Anything else there isn't a sign-in.
    await storage.setItem(key, JSON.stringify({ refresh_token: 'r' }));
    expect(await mod.readSavedSession()).toBeNull();
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    await storage.setItem(key, '{not json');
    expect(await mod.readSavedSession()).toBeNull();

    expect(await mod.forgetSavedSession()).toBe(true);
    expect(await storage.getItem(key)).toBeNull();
  });

  it('has no saved sign-in without a server', async () => {
    const mod = loadWith({ EXPO_PUBLIC_SUPABASE_URL: undefined, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined });
    expect(await mod.readSavedSession()).toBeNull();
    expect(await mod.forgetSavedSession()).toBe(false);
  });

  it('gives photo uploads longer than other requests', () => {
    const mod = loadWith({});
    expect(mod.timeLimitFor('https://x.supabase.co/storage/v1/object/spot-photos/a.jpg')).toBe(90_000);
    expect(mod.timeLimitFor('https://x.supabase.co/rest/v1/spots_api')).toBe(30_000);
  });
});
