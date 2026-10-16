// Test stand-in for expo-notifications: a phone that hasn't been asked yet,
// says yes when asked (unless a test says otherwise), and hands out one Expo
// push address. Tests tap notifications with `tap(url)`.

import { jest } from '@jest/globals';

export enum AndroidImportance {
  DEFAULT = 3,
}

export enum IosAuthorizationStatus {
  NOT_DETERMINED = 0,
  DENIED = 1,
  AUTHORIZED = 2,
  PROVISIONAL = 3,
  EPHEMERAL = 4,
}

interface Permission {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}

interface Response {
  notification: { request: { identifier: string; content: { data: Record<string, unknown> } } };
  actionIdentifier: string;
}

type Listener = (response: Response) => void;

const ASK: Permission = { granted: false, canAskAgain: true, status: 'undetermined' };

export const state = {
  permission: { ...ASK } as Permission,
  /** What the camper answers when asked. */
  answer: 'granted' as 'granted' | 'denied',
  token: 'ExponentPushToken[test-phone-1]',
  lastResponse: null as Response | null,
  listeners: new Set<Listener>(),
};

export function reset(): void {
  state.permission = { ...ASK };
  state.answer = 'granted';
  state.token = 'ExponentPushToken[test-phone-1]';
  state.lastResponse = null;
  state.listeners.clear();
}

export function allow(): void {
  state.permission = { granted: true, canAskAgain: true, status: 'granted' };
}

export function deny(): void {
  state.permission = { granted: false, canAskAgain: false, status: 'denied' };
}

export function response(url: unknown, id = 'note-1'): Response {
  return {
    notification: { request: { identifier: id, content: { data: { url } } } },
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
  };
}

/** The camper taps a notification while the app runs. */
export function tap(url: unknown, id = 'note-1'): void {
  const r = response(url, id);
  state.lastResponse = r;
  for (const listener of [...state.listeners]) listener(r);
}

export const getPermissionsAsync = jest.fn(async () => ({ ...state.permission }));

export const requestPermissionsAsync = jest.fn(async () => {
  if (state.answer === 'granted') allow();
  else deny();
  return { ...state.permission };
});

export const setNotificationChannelAsync = jest.fn(async (_id: string, _channel: Record<string, unknown>) => null);

export const getExpoPushTokenAsync = jest.fn(async (_options?: { projectId?: string }) => ({
  type: 'expo',
  data: state.token,
}));

export const setNotificationHandler = jest.fn();

export const getLastNotificationResponse = jest.fn(() => state.lastResponse);

export const clearLastNotificationResponse = jest.fn(() => {
  state.lastResponse = null;
});

export const addNotificationResponseReceivedListener = jest.fn((listener: Listener) => {
  state.listeners.add(listener);
  return { remove: () => state.listeners.delete(listener) };
});
