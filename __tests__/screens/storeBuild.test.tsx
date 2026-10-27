// What only works in the App Store and Google Play versions of DisCamp:
// notifications, the tip jar, and disconnecting Apple when an account is
// deleted. Expo Go (the default in tests) gets an explanation instead.

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import Constants from 'expo-constants';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { AppState, Linking } from 'react-native';

import { TIP_PATIENCE_MS } from '@/data/tipsStore';
import { inExpoGo } from '@/lib/expoGo';
import { resetPushForTests } from '@/lib/push';

import { fakeBackend, SAM, type FakeBackend, type FakeUser } from '../../test/fakeSupabase';
import { connectServer, resetServer, spyOnAlerts } from '../../test/helpers';
import type * as PhoneMock from '../../test/mocks/expoNotifications';
import type * as StoreMock from '../../test/mocks/expoIap';
import { renderApp } from '../../test/renderApp';

jest.mock('@/data/seedSpots', () => jest.requireActual('../../test/mocks/seedSpots'));
jest.mock('@/lib/expoGo', () => ({ inExpoGo: jest.fn(() => false) }));

const phone = jest.requireMock<typeof PhoneMock>('expo-notifications');
const store = jest.requireMock<typeof StoreMock>('expo-iap');

const config = Constants.expoConfig as { extra?: unknown };
const savedExtra = config.extra;

function server(user: FakeUser | null = SAM): FakeBackend {
  const backend = fakeBackend();
  backend.auth.setUser(user);
  connectServer(backend);
  return backend;
}

beforeEach(() => {
  resetPushForTests();
  config.extra = { eas: { projectId: 'project-1234' } };
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  config.extra = savedExtra;
  resetServer();
  jest.restoreAllMocks();
  jest.mocked(inExpoGo).mockReturnValue(false);
});

describe('Notifications', () => {
  it('turns on from Account, registering this phone', async () => {
    const backend = server();
    await renderApp('/account');
    expect(await screen.findByText(/Get a notification when a moderator reviews a cleanup you sent/)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Turn on notifications')));
    expect(await screen.findByText(/^On\. /)).toBeTruthy();
    expect(phone.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(backend.pushTokens.get('ExponentPushToken[test-phone-1]')).toBe(SAM.id);

    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    fireEvent.press(screen.getByText('Notification settings'));
    expect(open).toHaveBeenCalled();
  });

  it('takes a no when asked', async () => {
    phone.state.answer = 'denied';
    const backend = server();
    await renderApp('/account');
    await act(async () => fireEvent.press(await screen.findByText('Turn on notifications')));
    expect(await screen.findByText(/Off in your phone's settings/)).toBeTruthy();
    expect(backend.pushTokens.size).toBe(0);
  });

  it('shows notifications while DisCamp is open, quietly', async () => {
    server();
    await renderApp('/');
    const [handler] = phone.setNotificationHandler.mock.calls.at(-1) as [
      { handleNotification: () => Promise<unknown> },
    ];
    await expect(handler.handleNotification()).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });

  it('points to Settings once the camper said no there', async () => {
    phone.deny();
    server();
    await renderApp('/account');
    expect(await screen.findByText(/Off in your phone's settings/)).toBeTruthy();
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    fireEvent.press(screen.getByText('Open Settings'));
    expect(open).toHaveBeenCalled();
  });

  it('says so when it can’t turn on, and tries again', async () => {
    const backend = server();
    backend.intercept = (q) =>
      q.table === 'rpc:register_push_token'
        ? Promise.resolve({ data: null, error: { message: 'offline' } })
        : undefined;
    await renderApp('/account');
    await act(async () => fireEvent.press(await screen.findByText('Turn on notifications')));
    expect(await screen.findByText("Couldn't turn on notifications. Check your signal and try again.")).toBeTruthy();
    backend.intercept = null;
    await act(async () => fireEvent.press(screen.getByText('Turn on notifications')));
    expect(await screen.findByText(/^On\. /)).toBeTruthy();
  });

  it('refreshes this phone’s address when a camper who said yes opens the app, and forgets it on sign-out', async () => {
    phone.allow();
    const backend = server();
    await renderApp('/account');
    await waitFor(() => expect(backend.pushTokens.get('ExponentPushToken[test-phone-1]')).toBe(SAM.id));
    expect(phone.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(phone.setNotificationHandler).toHaveBeenCalled();

    await act(async () => fireEvent.press(screen.getByText('Sign out')));
    expect(await screen.findByText('Add the spots you know')).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith('forget_push_token', { push_token: 'ExponentPushToken[test-phone-1]' });
    expect(backend.pushTokens.size).toBe(0);
  });

  it('explains where notifications work', async () => {
    server();
    jest.mocked(inExpoGo).mockReturnValue(true);
    await renderApp('/account');
    expect(await screen.findByText(/Notifications work in the App Store and Google Play versions/)).toBeTruthy();
    screen.unmount();

    jest.mocked(inExpoGo).mockReturnValue(false);
    config.extra = {};
    await renderApp('/account');
    expect(await screen.findByText(/Notifications aren't set up in this version/)).toBeTruthy();
  });

  it('opens the screen a tapped notification is about, once, and only DisCamp screens', async () => {
    server();
    const app = await renderApp('/');
    act(() => phone.tap('/review', 'note-1'));
    await waitFor(() => expect(app.getPathname()).toBe('/review'));
    act(() => phone.tap('/account', 'note-1'));
    act(() => phone.tap('https://example.com', 'note-2'));
    expect(app.getPathname()).toBe('/review');
  });

  it('opens the screen when a notification opened the app', async () => {
    server();
    phone.state.lastResponse = phone.response('/account', 'cold-start');
    const app = await renderApp('/');
    await waitFor(() => expect(app.getPathname()).toBe('/account'));
    expect(phone.clearLastNotificationResponse).toHaveBeenCalled();
  });
});

describe('Tip jar', () => {
  it('lists the tips in order at local prices, and thanks the camper', async () => {
    server();
    await renderApp('/account');
    expect(await screen.findByText('Support DisCamp')).toBeTruthy();
    const labels = (await screen.findAllByText(/ · \$/)).map((t) => t.props.children);
    expect(labels).toEqual(['Coffee at camp · $2.99', 'A bundle of firewood · $4.99', 'A tank of gas · $9.99']);

    await act(async () => fireEvent.press(screen.getByText('A tank of gas · $9.99')));
    expect(await screen.findByText('Thank you! Your tip keeps DisCamp free for every camper.')).toBeTruthy();
    expect(store.requestPurchase).toHaveBeenCalledWith({
      request: { apple: { sku: 'tip_large' }, google: { skus: ['tip_large'] } },
      type: 'in-app',
    });
    expect(store.finishTransaction).toHaveBeenCalledWith({
      purchase: expect.objectContaining({ productId: 'tip_large' }),
      isConsumable: true,
    });
  });

  it('is there for signed-out campers and versions without a server', async () => {
    server(null);
    await renderApp('/account');
    expect(await screen.findByText('Coffee at camp · $2.99')).toBeTruthy();
    screen.unmount();
    connectServer(null);
    await renderApp('/account');
    expect(await screen.findByText('Coffee at camp · $2.99')).toBeTruthy();
  });

  it('says nothing when the camper cancels, and explains other outcomes', async () => {
    server();
    await renderApp('/account');
    const tip = async () => act(async () => fireEvent.press(await screen.findByText('Coffee at camp · $2.99')));

    store.state.next = 'cancelled';
    await tip();
    expect(screen.queryByText(/didn't go through/)).toBeNull();
    expect(screen.queryByText(/Thank you!/)).toBeNull();

    store.state.next = 'failed';
    await tip();
    expect(
      await screen.findByText("The tip didn't go through, and you weren't charged. Please try again."),
    ).toBeTruthy();

    store.state.next = 'offline';
    await tip();
    expect(await screen.findByText(/You're offline or the store can't be reached/)).toBeTruthy();

    store.state.next = 'pending';
    await tip();
    expect(await screen.findByText(/Your tip is waiting for payment/)).toBeTruthy();
    expect(store.finishTransaction).not.toHaveBeenCalled();

    store.state.next = 'refused';
    await tip();
    expect(await screen.findByText("The store couldn't start the tip. Please try again.")).toBeTruthy();

    // The store doesn't say how it went: no endless spinner.
    store.state.next = 'unknown';
    await tip();
    expect(await screen.findByText(/The store hasn't confirmed your tip yet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Coffee at camp · $2.99' }).props.accessibilityState).toMatchObject({
      busy: false,
    });
  });

  it('gives the tip buttons back if the store never answers', async () => {
    server();
    await renderApp('/account');
    store.state.next = 'silent';
    await act(async () => fireEvent.press(await screen.findByText('Coffee at camp · $2.99')));
    const coffee = () => screen.getByRole('button', { name: 'Coffee at camp · $2.99' });
    expect(coffee().props.accessibilityState).toMatchObject({ busy: true });
    await act(async () => jest.advanceTimersByTime(TIP_PATIENCE_MS));
    expect(coffee().props.accessibilityState).toMatchObject({ busy: false });
    expect(await screen.findByText(/The store hasn't confirmed your tip yet/)).toBeTruthy();
    store.state.next = 'purchased';
    await act(async () => fireEvent.press(screen.getByText('Coffee at camp · $2.99')));
    expect(await screen.findByText(/Thank you!/)).toBeTruthy();
  });

  it('stays calm when the store can’t finish a tip', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    store.finishTransaction.mockRejectedValueOnce(new Error('StoreKit hiccup'));
    server();
    await renderApp('/account');
    await act(async () => fireEvent.press(await screen.findByText('Coffee at camp · $2.99')));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(screen.queryByText(/Thank you!/)).toBeNull();
    // Nothing is stuck: the camper can tip again.
    await act(async () => fireEvent.press(screen.getByText('Coffee at camp · $2.99')));
    expect(await screen.findByText(/Thank you!/)).toBeTruthy();
  });

  it('finishes a tip left from before, without a fuss', async () => {
    store.state.left = [
      { id: 'old-1', productId: 'tip_small', purchaseState: 'purchased' },
      { id: 'other', productId: 'something_else', purchaseState: 'purchased' },
    ];
    server();
    await renderApp('/account');
    await waitFor(() => expect(store.finishTransaction).toHaveBeenCalledTimes(1));
    expect(store.finishTransaction).toHaveBeenCalledWith({
      purchase: expect.objectContaining({ id: 'old-1' }),
      isConsumable: true,
    });
    // The store replays one while the camper isn't tipping: finished quietly.
    await act(async () => store.emitPurchase({ id: 'old-2', productId: 'tip_medium', purchaseState: 'purchased' }));
    await act(async () => store.emitPurchase({ id: 'x', productId: 'not_a_tip', purchaseState: 'purchased' }));
    expect(store.finishTransaction).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Thank you!/)).toBeNull();
  });

  it('finishes a tip paid later only once it’s paid, when DisCamp comes back to the front', async () => {
    const handlers: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      handlers.push(handler as (state: string) => void);
      return { remove: () => undefined } as never;
    });
    store.state.left = [{ id: 'cash-1', productId: 'tip_large', purchaseState: 'pending' }];
    server();
    await renderApp('/account');
    await waitFor(() => expect(store.getAvailablePurchases).toHaveBeenCalledTimes(1));
    expect(store.finishTransaction).not.toHaveBeenCalled();

    // Paid at the store while DisCamp was in the background.
    store.state.left = [{ id: 'cash-1', productId: 'tip_large', purchaseState: 'purchased' }];
    await act(async () => handlers.forEach((h) => h('active')));
    await waitFor(() =>
      expect(store.finishTransaction).toHaveBeenCalledWith({
        purchase: expect.objectContaining({ id: 'cash-1' }),
        isConsumable: true,
      }),
    );
    // The listener hearing about it too doesn't finish it twice.
    await act(async () => store.emitPurchase({ id: 'cash-1', productId: 'tip_large', purchaseState: 'purchased' }));
    expect(store.finishTransaction).toHaveBeenCalledTimes(1);
  });

  it('starts one purchase for a double tap, and stays quiet when the store says cancelled', async () => {
    server();
    await renderApp('/account');
    const button = await screen.findByText('Coffee at camp · $2.99');
    store.requestPurchase.mockImplementationOnce(() => new Promise(() => undefined));
    fireEvent.press(button);
    fireEvent.press(button);
    expect(store.requestPurchase).toHaveBeenCalledTimes(1);
    screen.unmount();

    await renderApp('/account');
    store.requestPurchase.mockRejectedValueOnce(Object.assign(new Error('Cancelled'), { code: 'user-cancelled' }));
    await act(async () => fireEvent.press(await screen.findByText('Coffee at camp · $2.99')));
    expect(screen.queryByText(/couldn't start the tip/)).toBeNull();
  });

  it('tries the store again', async () => {
    store.state.connectFails = true;
    server();
    await renderApp('/account');
    expect(await screen.findByText(/The tip jar can't reach the store right now/)).toBeTruthy();
    store.state.connectFails = false;
    await act(async () => fireEvent.press(screen.getByText('Try again')));
    expect(await screen.findByText('Coffee at camp · $2.99')).toBeTruthy();
  });

  it('says when the store can’t be reached, or in Expo Go', async () => {
    store.state.connectFails = true;
    server();
    await renderApp('/account');
    expect(await screen.findByText(/The tip jar can't reach the store right now/)).toBeTruthy();
    screen.unmount();

    store.state.connectFails = false;
    store.state.products = [];
    await renderApp('/account');
    expect(await screen.findByText(/The tip jar can't reach the store right now/)).toBeTruthy();
    screen.unmount();

    jest.mocked(inExpoGo).mockReturnValue(true);
    await renderApp('/account');
    expect(await screen.findByText('Tips work in the App Store and Google Play versions of DisCamp.')).toBeTruthy();
  });
});

describe('Deleting an account that used Sign in with Apple', () => {
  const APPLE_SAM: FakeUser = { ...SAM, provider: 'apple' };

  it('disconnects DisCamp from the Apple ID first', async () => {
    const alerts = spyOnAlerts();
    const backend = server(APPLE_SAM);
    await renderApp('/account');
    fireEvent.press(await screen.findByText('Delete account'));
    expect(alerts.alert.mock.calls.at(-1)?.[1]).toMatch(/Apple will ask you to confirm/);
    await act(async () => alerts.press('Delete account'));
    await waitFor(() => expect(alerts.lastTitle()).toBe('Account deleted'));
    expect(alerts.alert.mock.calls.at(-1)?.[1]).toMatch(/disconnected from your Apple ID too/);
    expect(backend.invoke).toHaveBeenCalledWith('apple-revoke', expect.anything());
    expect(backend.rpc).toHaveBeenCalledWith('delete_my_account');
    expect(screen.queryByText('Your DisCamp account is deleted')).toBeNull();
  });

  it('keeps the account when the camper closes Apple’s sheet, unless they delete without Apple', async () => {
    const apple = jest.requireMock<{ signInAsync: jest.Mock<() => Promise<unknown>> }>('expo-apple-authentication');
    const alerts = spyOnAlerts();
    const backend = server(APPLE_SAM);
    await renderApp('/account');
    const cancelled = () =>
      apple.signInAsync.mockRejectedValueOnce(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));

    cancelled();
    fireEvent.press(await screen.findByText('Delete account'));
    await act(async () => alerts.press('Delete account'));
    await waitFor(() => expect(alerts.lastTitle()).toBe('Your account is still here'));
    alerts.press('Keep my account');
    expect(backend.rpc).not.toHaveBeenCalledWith('delete_my_account');
    expect(screen.getByText('Signed in as')).toBeTruthy();

    cancelled();
    fireEvent.press(screen.getByText('Delete account'));
    await act(async () => alerts.press('Delete account'));
    await waitFor(() => expect(alerts.lastTitle()).toBe('Your account is still here'));
    await act(async () => alerts.press('Delete without Apple'));
    await waitFor(() => expect(alerts.lastTitle()).toBe('Account deleted'));
    expect(backend.rpc).toHaveBeenCalledWith('delete_my_account');
    expect(backend.invoke).not.toHaveBeenCalled();
    expect(await screen.findByText('Your DisCamp account is deleted')).toBeTruthy();
  });
});
