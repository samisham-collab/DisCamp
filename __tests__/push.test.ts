// Notifications on the phone: where they work, asking, registering this
// phone's address with the server, and forgetting it on sign-out.

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { inExpoGo } from '@/lib/expoGo';
import {
  clearPushRegistration,
  easProjectId,
  forgetThisPhone,
  notificationPath,
  notificationsModule,
  pushPermission,
  pushUnavailable,
  resetPushForTests,
  turnOnPush,
} from '@/lib/push';

import { fakeBackend, SAM } from '../test/fakeSupabase';
import type * as PhoneMock from '../test/mocks/expoNotifications';

jest.mock('@/lib/expoGo', () => ({ inExpoGo: jest.fn(() => false) }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} }, easConfig: {} },
}));

const phone = jest.requireMock<typeof PhoneMock>('expo-notifications');

const constants = Constants as unknown as { expoConfig: { extra: unknown }; easConfig: { projectId?: unknown } };

function withProject(projectId: unknown = 'project-1234') {
  constants.expoConfig = { extra: { eas: { projectId } } };
  constants.easConfig = {};
}

function signedIn() {
  const backend = fakeBackend();
  backend.auth.setUser(SAM);
  return backend;
}

beforeEach(() => {
  resetPushForTests();
  withProject();
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.mocked(inExpoGo).mockReturnValue(false);
});

describe('where notifications work', () => {
  it('works in a store build with an EAS project', () => {
    expect(pushUnavailable()).toBeNull();
    expect(notificationsModule()).not.toBeNull();
    expect(easProjectId()).toBe('project-1234');
  });

  it('not in Expo Go, on the web, or before `eas init`', () => {
    jest.mocked(inExpoGo).mockReturnValue(true);
    expect(pushUnavailable()).toBe('expo-go');
    expect(notificationsModule()).toBeNull();
    jest.mocked(inExpoGo).mockReturnValue(false);

    withProject('  ');
    expect(easProjectId()).toBeNull();
    expect(pushUnavailable()).toBe('no-project');
    withProject(42);
    expect(pushUnavailable()).toBe('no-project');

    jest.replaceProperty(Platform, 'OS', 'web');
    expect(pushUnavailable()).toBe('web');
  });

  it('reads the project id from the EAS config too', () => {
    constants.expoConfig = { extra: {} };
    constants.easConfig = { projectId: 'from-eas' };
    expect(easProjectId()).toBe('from-eas');
  });
});

describe('the permission', () => {
  it('says whether the camper said yes, no, or hasn’t been asked', async () => {
    expect(await pushPermission()).toBe('undetermined');
    phone.allow();
    expect(await pushPermission()).toBe('granted');
    phone.deny();
    expect(await pushPermission()).toBe('denied');
    // iPhone's quiet "provisional" notifications count as yes.
    phone.getPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: true,
      ios: { status: phone.IosAuthorizationStatus.PROVISIONAL },
    } as never);
    expect(await pushPermission()).toBe('granted');
  });

  it('is unknown where notifications can’t work, or when the phone won’t say', async () => {
    jest.mocked(inExpoGo).mockReturnValue(true);
    expect(await pushPermission()).toBeNull();
    jest.mocked(inExpoGo).mockReturnValue(false);
    phone.getPermissionsAsync.mockRejectedValueOnce(new Error('boom'));
    expect(await pushPermission()).toBeNull();
  });
});

describe('turning notifications on', () => {
  it('asks, then registers this phone for the signed-in camper', async () => {
    const backend = signedIn();
    expect(await turnOnPush(backend.client, { ask: true })).toEqual({ status: 'on' });
    expect(phone.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(phone.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-1234' });
    expect(backend.rpc).toHaveBeenCalledWith('register_push_token', {
      push_token: 'ExponentPushToken[test-phone-1]',
      os: 'ios',
    });
    expect(backend.pushTokens.get('ExponentPushToken[test-phone-1]')).toBe(SAM.id);
    // iPhone has no channels.
    expect(phone.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('never asks when told not to: only refreshes a yes', async () => {
    const backend = signedIn();
    expect(await turnOnPush(backend.client, { ask: false })).toEqual({ status: 'denied' });
    expect(phone.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(backend.pushTokens.size).toBe(0);

    phone.allow();
    expect(await turnOnPush(backend.client, { ask: false })).toEqual({ status: 'on' });
    expect(phone.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(backend.pushTokens.size).toBe(1);
  });

  it('respects a no', async () => {
    const backend = signedIn();
    phone.state.answer = 'denied';
    expect(await turnOnPush(backend.client, { ask: true })).toEqual({ status: 'denied' });
    expect(backend.pushTokens.size).toBe(0);
  });

  it('sets up the Android channel first', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const backend = signedIn();
    phone.allow();
    expect(await turnOnPush(backend.client, { ask: true })).toEqual({ status: 'on' });
    expect(phone.setNotificationChannelAsync).toHaveBeenCalledWith(
      'cleanups',
      expect.objectContaining({ name: 'Cleanups', importance: phone.AndroidImportance.DEFAULT }),
    );
    expect(backend.rpc).toHaveBeenCalledWith('register_push_token', expect.objectContaining({ os: 'android' }));
  });

  it('says so when the server or Expo says no', async () => {
    const backend = signedIn();
    phone.allow();
    backend.intercept = (q) =>
      q.table === 'rpc:register_push_token'
        ? Promise.resolve({ data: null, error: { message: 'bad_push_token' } })
        : undefined;
    expect(await turnOnPush(backend.client, { ask: true })).toEqual({
      status: 'error',
      message: "Couldn't turn on notifications. Check your signal and try again.",
    });
    phone.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('No network'));
    expect((await turnOnPush(backend.client, { ask: true })).status).toBe('error');
  });

  it('does nothing where notifications can’t work', async () => {
    jest.mocked(inExpoGo).mockReturnValue(true);
    const backend = signedIn();
    expect(await turnOnPush(backend.client, { ask: true })).toEqual({ status: 'unavailable', reason: 'expo-go' });
    jest.mocked(inExpoGo).mockReturnValue(false);
    withProject(null);
    expect(await turnOnPush(backend.client, { ask: true })).toEqual({ status: 'unavailable', reason: 'no-project' });
    expect(backend.rpc).not.toHaveBeenCalled();
  });
});

describe('signing out', () => {
  it('forgets this phone on the server', async () => {
    const backend = signedIn();
    phone.allow();
    await turnOnPush(backend.client, { ask: false });
    phone.getExpoPushTokenAsync.mockClear();
    await forgetThisPhone(backend.client);
    expect(backend.rpc).toHaveBeenCalledWith('forget_push_token', { push_token: 'ExponentPushToken[test-phone-1]' });
    expect(backend.pushTokens.size).toBe(0);
    // It knew the address: no need to ask the phone.
    expect(phone.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('asks the phone for its address when this run never registered it', async () => {
    const backend = signedIn();
    phone.allow();
    // Registered on an earlier launch; this launch's refresh never finished.
    backend.pushTokens.set('ExponentPushToken[test-phone-1]', SAM.id);
    await forgetThisPhone(backend.client);
    expect(backend.pushTokens.size).toBe(0);
  });

  it('has nothing to forget where notifications were never allowed or can’t work', async () => {
    const backend = signedIn();
    await forgetThisPhone(backend.client);
    jest.mocked(inExpoGo).mockReturnValue(true);
    await forgetThisPhone(backend.client);
    expect(backend.rpc).not.toHaveBeenCalled();
  });

  it('carries on when the server can’t be reached', async () => {
    const backend = signedIn();
    phone.allow();
    await turnOnPush(backend.client, { ask: false });
    backend.intercept = (q) =>
      q.table === 'rpc:forget_push_token' ? Promise.resolve({ data: null, error: { message: 'offline' } }) : undefined;
    await expect(forgetThisPhone(backend.client)).resolves.toBeUndefined();
  });

  it('doesn’t keep an address registered while signing out', async () => {
    const backend = signedIn();
    phone.allow();
    let release: (value: { type: string; data: string }) => void = () => undefined;
    phone.getExpoPushTokenAsync.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const turning = turnOnPush(backend.client, { ask: false });
    await forgetThisPhone(backend.client);
    release({ type: 'expo', data: 'ExponentPushToken[test-phone-1]' });
    await turning;
    // The late registration isn't remembered as this camper's, but the next
    // sign-out still finds the address by asking the phone.
    clearPushRegistration();
    await forgetThisPhone(backend.client);
    expect(backend.pushTokens.size).toBe(0);
  });
});

describe('tapping a notification', () => {
  it('opens only DisCamp screens', () => {
    expect(notificationPath({ url: '/review' })).toBe('/review');
    expect(notificationPath({ url: '/cleanup/0000000a-0000-4000-8000-00000000c1ea' })).toBe(
      '/cleanup/0000000a-0000-4000-8000-00000000c1ea',
    );
    expect(notificationPath({ url: 'https://example.com' })).toBeNull();
    expect(notificationPath({ url: '/cleanup/../../etc' })).toBeNull();
    expect(notificationPath({})).toBeNull();
    expect(notificationPath(null)).toBeNull();
    expect(notificationPath('review')).toBeNull();
  });
});
