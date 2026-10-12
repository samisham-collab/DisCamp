import { describe, expect, it, jest } from '@jest/globals';

import type * as Config from '@/config';
import { cleanEmail, LEGAL_BASE_URL, LEGAL_URLS, SUPPORT_EMAIL, withSlash } from '@/config';

type ConfigModule = typeof Config;

describe('support and legal settings', () => {
  it('accepts only a real-looking support email', () => {
    expect(cleanEmail(' help@discamp.app ')).toBe('help@discamp.app');
    for (const bad of [undefined, '', 'help', 'help@', 'a b@c.d', '@discamp.app']) expect(cleanEmail(bad)).toBeNull();
    expect(SUPPORT_EMAIL).toBeNull();
  });

  it('publishes the legal pages on GitHub Pages unless told otherwise', () => {
    expect(LEGAL_BASE_URL).toBe('https://samisham-collab.github.io/DisCamp/');
    expect(LEGAL_URLS).toEqual({
      privacy: 'https://samisham-collab.github.io/DisCamp/privacy/',
      terms: 'https://samisham-collab.github.io/DisCamp/terms/',
      support: 'https://samisham-collab.github.io/DisCamp/support/',
    });
    expect(withSlash('https://x.test/legal')).toBe('https://x.test/legal/');
    expect(withSlash('https://x.test/')).toBe('https://x.test/');
  });

  it('reads both from the environment', () => {
    jest.isolateModules(() => {
      process.env.EXPO_PUBLIC_SUPPORT_EMAIL = 'help@discamp.app';
      process.env.EXPO_PUBLIC_LEGAL_BASE_URL = 'https://discamp.app/legal';
      const fresh = jest.requireActual<ConfigModule>('@/config');
      expect(fresh.SUPPORT_EMAIL).toBe('help@discamp.app');
      expect(fresh.LEGAL_URLS.terms).toBe('https://discamp.app/legal/terms/');
      delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
      delete process.env.EXPO_PUBLIC_LEGAL_BASE_URL;
    });
  });
});
