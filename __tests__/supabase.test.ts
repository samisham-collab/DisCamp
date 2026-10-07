// The real Supabase module (jest.setup.ts mocks it for every other test).

import { afterEach, describe, expect, it, jest } from '@jest/globals';

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
});
