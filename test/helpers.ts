// Small helpers shared by screen tests.

import { jest } from '@jest/globals';
import { Alert, type AlertButton } from 'react-native';

import { getSupabase } from '@/lib/supabase';

import type { FakeBackend } from './fakeSupabase';

/** Makes the app talk to `backend` (or to no server, with null) until reset. */
export function connectServer(backend: FakeBackend | null): void {
  jest.mocked(getSupabase).mockImplementation(() => backend?.client ?? null);
}

/** Back to no server, the default for every test. */
export function resetServer(): void {
  jest.mocked(getSupabase).mockImplementation(() => null);
}

/** Catches Alert.alert calls so a test can read them and press their buttons. */
export function spyOnAlerts() {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  return {
    alert,
    /** Title of the newest alert. */
    lastTitle: () => alert.mock.calls.at(-1)?.[0],
    /** Presses a button on the newest alert. */
    press: (label: string) => {
      const buttons = (alert.mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
      const button = buttons.find((b) => b.text === label);
      if (!button) throw new Error(`No "${label}" button on the alert`);
      button.onPress?.();
    },
  };
}
