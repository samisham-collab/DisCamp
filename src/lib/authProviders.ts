// The sign-in services DisCamp offers. Supabase calls Microsoft "azure".
//
// EXPO_PUBLIC_AUTH_PROVIDERS picks which buttons show, e.g. "google,github"
// while Apple isn't set up yet. Unset means all four.

import type { IconName } from '../components/ui';
import { log } from './log';

export type AuthProviderId = 'apple' | 'google' | 'azure' | 'github';

export interface AuthProviderInfo {
  id: AuthProviderId;
  label: string;
  icon: IconName;
}

/** Display order. Apple first: App Store rules want it at least as prominent as the others. */
export const AUTH_PROVIDERS: readonly AuthProviderInfo[] = [
  { id: 'apple', label: 'Apple', icon: 'logo-apple' },
  { id: 'google', label: 'Google', icon: 'logo-google' },
  { id: 'azure', label: 'Microsoft', icon: 'logo-microsoft' },
  { id: 'github', label: 'GitHub', icon: 'logo-github' },
];

const ALL_IDS = AUTH_PROVIDERS.map((p) => p.id);

/** "Google" for "google", "Microsoft" for "azure"; anything else as given. */
export function providerLabel(id: string | null | undefined): string {
  return AUTH_PROVIDERS.find((p) => p.id === id)?.label ?? (id ? id : 'email');
}

/** Reads a list like "google, github" into provider ids, in display order. */
export function parseProviderList(raw: string | undefined): AuthProviderId[] {
  if (raw == null || raw.trim() === '') return [...ALL_IDS];
  const asked = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    // "microsoft" is what people will type; Supabase's name is "azure".
    .map((s) => (s === 'microsoft' ? 'azure' : s));
  const unknown = asked.filter((s) => !(ALL_IDS as string[]).includes(s));
  if (unknown.length > 0) log.warn('Ignoring unknown sign-in providers in EXPO_PUBLIC_AUTH_PROVIDERS', { unknown });
  return ALL_IDS.filter((id) => asked.includes(id));
}

// Read with dot access so Expo inlines it at build time.
const configured = process.env.EXPO_PUBLIC_AUTH_PROVIDERS;

export function enabledProviders(): AuthProviderId[] {
  return parseProviderList(configured);
}
