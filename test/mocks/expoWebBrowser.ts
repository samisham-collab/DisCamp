// Test stand-in for expo-web-browser's sign-in sheet. By default the camper
// signs in and the provider redirects back with a good code.

import { jest } from '@jest/globals';

type AuthResult = { type: 'success'; url: string } | { type: 'cancel' | 'dismiss' };

export const openAuthSessionAsync = jest.fn(async (_url: string, redirectUrl?: string | null): Promise<AuthResult> => ({
  type: 'success',
  url: `${redirectUrl ?? 'discamp://auth/callback'}?code=good-code-${Math.random().toString(36).slice(2)}`,
}));

export const maybeCompleteAuthSession = jest.fn(() => ({ type: 'failed', message: 'Not a popup' }));

export const WebBrowserResultType = {
  CANCEL: 'cancel',
  DISMISS: 'dismiss',
  OPENED: 'opened',
  LOCKED: 'locked',
} as const;
