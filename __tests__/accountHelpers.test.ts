import { describe, expect, it, jest } from '@jest/globals';

import {
  appleRemovalSteps,
  AUTH_PROVIDERS,
  enabledProviders,
  parseProviderList,
  providerLabel,
} from '@/lib/authProviders';
import { checkDisplayName } from '@/lib/displayName';
import { safeNext } from '@/lib/navigation';
import { formatDay } from '@/lib/time';

describe('sign-in providers', () => {
  it('shows all four by default, Apple first', () => {
    expect(AUTH_PROVIDERS.map((p) => p.label)).toEqual(['Apple', 'Google', 'Microsoft', 'GitHub']);
    expect(parseProviderList(undefined)).toEqual(['apple', 'google', 'azure', 'github']);
    expect(parseProviderList('  ')).toEqual(['apple', 'google', 'azure', 'github']);
    expect(enabledProviders()).toEqual(['apple', 'google', 'azure', 'github']);
  });

  it('reads a list in any order and case, and accepts "microsoft"', () => {
    expect(parseProviderList('GitHub, microsoft ,google')).toEqual(['google', 'azure', 'github']);
    expect(parseProviderList('azure')).toEqual(['azure']);
  });

  it('ignores (and logs) names it doesn’t know', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseProviderList('google,facebook')).toEqual(['google']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown sign-in providers'), {
      unknown: ['facebook'],
    });
    warn.mockRestore();
  });

  it('names providers the way campers know them', () => {
    expect(providerLabel('azure')).toBe('Microsoft');
    expect(providerLabel('github')).toBe('GitHub');
    expect(providerLabel('email')).toBe('email');
    expect(providerLabel(null)).toBe('email');
  });

  it('explains how to finish removing DisCamp from an Apple Account', () => {
    expect(appleRemovalSteps('ios')).toMatch(/Open Settings, tap your name, then Sign in with Apple/);
    expect(appleRemovalSteps('android')).toMatch(/account\.apple\.com/);
    expect(appleRemovalSteps()).toBe(appleRemovalSteps('ios'));
  });
});

describe('display names', () => {
  it('tidies spacing and accepts up to 40 characters', () => {
    expect(checkDisplayName('  Sam   I.\n')).toEqual({ ok: true, name: 'Sam I.' });
    expect(checkDisplayName('🏕️'.repeat(20))).toEqual({ ok: true, name: '🏕️'.repeat(20) });
    expect(checkDisplayName('x'.repeat(40))).toEqual({ ok: true, name: 'x'.repeat(40) });
  });

  it('rejects empty, long and email-like names', () => {
    expect(checkDisplayName(' \t ')).toEqual({ ok: false, message: 'Enter a name.' });
    expect(checkDisplayName('x'.repeat(41))).toEqual({ ok: false, message: 'Use 40 characters or fewer.' });
    expect(checkDisplayName('sam@example.com')).toEqual({
      ok: false,
      message: "Use a name, not an email address (no '@').",
    });
  });

  it('rejects names with words DisCamp doesn’t allow', () => {
    expect(checkDisplayName('Shit Head')).toEqual({
      ok: false,
      message: "Pick a name without words that aren't allowed on DisCamp.",
    });
    expect(checkDisplayName('Hooker Creek Hiker')).toEqual({ ok: true, name: 'Hooker Creek Hiker' });
  });
});

describe('after sign-in', () => {
  it('only goes on to known screens', () => {
    expect(safeNext('/spot/new')).toBe('/spot/new');
    expect(safeNext(['/account', '/x'])).toBe('/account');
    expect(safeNext('/spot/edit/camper-spot-1')).toBe('/spot/edit/camper-spot-1');
    expect(safeNext('/spot/smoky-gardens')).toBe('/spot/smoky-gardens');
    const task = '00000000-0000-4000-8000-0000000c1e01';
    for (const next of ['/cleanups', `/cleanup/${task}`, `/report/task/${task}`]) expect(safeNext(next)).toBe(next);
    expect(safeNext('/cleanup/not-an-id')).toBeNull();
    expect(safeNext('/report/spot/smoky-gardens')).toBe('/report/spot/smoky-gardens');
    expect(safeNext('/report/camper/22222222-2222-4222-8222-222222222222')).toBe(
      '/report/camper/22222222-2222-4222-8222-222222222222',
    );
    expect(safeNext('/report/camper/not-an-id')).toBeNull();
    expect(safeNext('/report/other/x')).toBeNull();
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext('/spot/edit/../../x')).toBeNull();
    expect(safeNext('//evil.example/spot/new')).toBeNull();
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext(42)).toBeNull();
  });
});

describe('dates', () => {
  it('formats a day, and nothing for a bad time', () => {
    expect(formatDay('2026-10-07T12:00:00.000Z')).toBe('Oct 7, 2026');
    expect(formatDay('not a date')).toBeNull();
    expect(formatDay(undefined)).toBeNull();
  });
});
