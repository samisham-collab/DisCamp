// Sign-in and the Account tab, end to end in the real app.

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import * as WebBrowser from 'expo-web-browser';
import { AccessibilityInfo } from 'react-native';

import { redirectSystemPath } from '@/app/+native-intent';

import { ALEX, fakeBackend, SAM } from '../../test/fakeSupabase';
import { makeRow } from '../../test/fixtures';
import { connectServer, resetServer, spyOnAlerts } from '../../test/helpers';
import { renderApp } from '../../test/renderApp';

// Pinned to Smoky Gardens only: see test/mocks/seedSpots.ts.
jest.mock('@/data/seedSpots', () => jest.requireActual('../../test/mocks/seedSpots'));

const SAMS_SPOT = makeRow({
  id: 'sams-spot',
  name: 'Sam Flat',
  created_by: SAM.id,
  added_by: 'Sam',
  created_at: '2026-10-07T12:00:00+00:00',
  verified: false,
  report_count: 0,
});

describe('Sign-in', () => {
  afterEach(() => {
    resetServer();
    jest.restoreAllMocks();
  });

  it('offers all four providers, Apple first with its own button', async () => {
    connectServer(fakeBackend());
    await renderApp('/sign-in');
    expect(await screen.findByText('Sign in to DisCamp')).toBeTruthy();
    expect(screen.getByTestId('apple-sign-in')).toBeTruthy();
    for (const label of ['Continue with Google', 'Continue with Microsoft', 'Continue with GitHub']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText(/Your email address is never shown/)).toBeTruthy();
  });

  it('takes a signed-out camper from "Add spot" through sign-in to the form', async () => {
    const backend = fakeBackend();
    connectServer(backend);
    const app = await renderApp('/');
    fireEvent.press(await screen.findByLabelText('Add a spot'));
    await waitFor(() => expect(app.getPathname()).toBe('/sign-in'));

    fireEvent.press(screen.getByText('Continue with Microsoft'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/new'));
    expect(backend.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'azure', options: expect.objectContaining({ scopes: 'email' }) }),
    );
    expect(await screen.findByLabelText('GPS location, required')).toBeTruthy();
  });

  it('signs in with Apple and goes back where the camper was', async () => {
    const backend = fakeBackend();
    // A new account: Apple shares the name only now, and it becomes the display name.
    backend.auth.nextUser = { ...SAM, displayName: 'Camper' };
    connectServer(backend);
    const app = await renderApp('/account');
    fireEvent.press(await screen.findByText('Sign in'));
    await waitFor(() => expect(app.getPathname()).toBe('/sign-in'));
    fireEvent.press(screen.getByTestId('apple-sign-in'));
    await waitFor(() => expect(app.getPathname()).toBe('/account'));
    expect(await screen.findByText('with Apple')).toBeTruthy();
    expect(await screen.findByText('Sam')).toBeTruthy();
    expect(backend.auth.signInWithIdToken).toHaveBeenCalled();
  });

  it('returns to the screen that asked for sign-in, without stacking a copy', async () => {
    connectServer(fakeBackend());
    const app = await renderApp('/spot/new');
    fireEvent.press(await screen.findByText('Sign in'));
    await waitFor(() => expect(app.getPathname()).toBe('/sign-in'));
    fireEvent.press(screen.getByText('Continue with Google'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/new'));
    expect(await screen.findByLabelText('Name, required')).toBeTruthy();
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });

  it('explains a failed sign-in and lets the camper try again', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    connectServer(fakeBackend());
    const app = await renderApp('/sign-in');
    jest
      .mocked(WebBrowser.openAuthSessionAsync)
      .mockResolvedValueOnce({ type: 'success', url: 'discamp://auth/callback?code=expired' });
    fireEvent.press(await screen.findByText('Continue with GitHub'));
    expect(await screen.findByText('That sign-in link expired. Please try again.')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('That sign-in link expired. Please try again.');

    // Closing the sheet is not an error.
    jest
      .mocked(WebBrowser.openAuthSessionAsync)
      .mockResolvedValueOnce({ type: WebBrowser.WebBrowserResultType.CANCEL });
    fireEvent.press(screen.getByText('Continue with GitHub'));
    await waitFor(() => expect(screen.queryByText('That sign-in link expired. Please try again.')).toBeNull());
    expect(app.getPathname()).toBe('/sign-in');

    fireEvent.press(screen.getByText('Continue with GitHub'));
    await waitFor(() => expect(app.getPathname()).not.toBe('/sign-in'));
  });

  it('says so when this version has no server', async () => {
    await renderApp('/sign-in');
    expect(screen.getByText("Sign-in isn't available")).toBeTruthy();
    screen.unmount();
    await renderApp('/');
    expect(screen.queryByLabelText('Add a spot')).toBeNull();
  });

  it('tells a camper who is already signed in, and carries on', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    connectServer(backend);
    const app = await renderApp('/sign-in?next=/spot/new');
    expect(await screen.findByText("You're signed in as Sam")).toBeTruthy();
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/new'));
  });

  it('finishes sign-in from a redirect link that reaches a screen', async () => {
    const backend = fakeBackend();
    connectServer(backend);
    const app = await renderApp('/auth/callback?code=good-from-link');
    await waitFor(() => expect(app.getPathname()).toBe('/account'));
    expect(backend.auth.exchangeCodeForSession).toHaveBeenCalledWith('good-from-link');
    expect(await screen.findByText('Signed in as')).toBeTruthy();
  });
});

describe('Incoming links', () => {
  afterEach(() => {
    resetServer();
    jest.restoreAllMocks();
  });

  it('passes ordinary links through', () => {
    expect(redirectSystemPath({ path: '/spot/smoky-gardens', initial: false })).toBe('/spot/smoky-gardens');
  });

  it('finishes sign-in from the redirect without changing screens', async () => {
    const backend = fakeBackend();
    connectServer(backend);
    expect(redirectSystemPath({ path: 'discamp://auth/callback?code=good-intent', initial: false })).toBeNull();
    expect(redirectSystemPath({ path: 'discamp://auth/callback?code=good-intent', initial: true })).toBe('/account');
    await waitFor(() => expect(backend.auth.userId).toBe(SAM.id));
    expect(backend.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    resetServer();
    expect(redirectSystemPath({ path: '/auth/callback?code=x', initial: false })).toBeNull();
  });

  it('never crashes the app over a link', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    connectServer(fakeBackend());
    jest.spyOn(String.prototype, 'replace').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(redirectSystemPath({ path: 'discamp://auth/callback?code=x', initial: true })).toBe('/');
    expect(error).toHaveBeenCalled();
  });
});

describe('Account tab', () => {
  afterEach(() => {
    resetServer();
    jest.restoreAllMocks();
  });

  it('invites a signed-out camper to sign in', async () => {
    connectServer(fakeBackend());
    const app = await renderApp('/account');
    expect(await screen.findByText('Add the spots you know')).toBeTruthy();
    fireEvent.press(screen.getByText('Sign in'));
    await waitFor(() => expect(app.getPathname()).toBe('/sign-in'));
  });

  it('explains that accounts need a server', async () => {
    await renderApp('/account');
    expect(screen.getByText("Accounts aren't available")).toBeTruthy();
  });

  it('shows who is signed in, privately, and the spots they added', async () => {
    const backend = fakeBackend([makeRow(), SAMS_SPOT]);
    backend.auth.setUser(SAM);
    connectServer(backend);
    const app = await renderApp('/account');
    expect(await screen.findByText('Sam')).toBeTruthy();
    expect(screen.getByText('with Google')).toBeTruthy();
    expect(screen.getByText('sam@example.com')).toBeTruthy();
    expect(screen.getByText('Email (only you see this)')).toBeTruthy();
    expect(await screen.findByText('Sam Flat')).toBeTruthy();
    expect(screen.getByText('Added Oct 7, 2026')).toBeTruthy();
    expect(screen.queryByText('Row spot')).toBeNull();

    fireEvent.press(screen.getByText('Sam Flat'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/sams-spot'));
    expect(await screen.findByText('Added by you on Oct 7, 2026')).toBeTruthy();
  });

  it('lists none for a new camper, and links to the form', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(ALEX);
    connectServer(backend);
    const app = await renderApp('/account');
    expect(await screen.findByText(/None yet/)).toBeTruthy();
    expect(screen.getByText('with GitHub')).toBeTruthy();
    fireEvent.press(screen.getByText('Add a spot'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/new'));
  });

  it('changes the display name, checking it first', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    connectServer(backend);
    await renderApp('/account');
    const field = await screen.findByLabelText('Display name');
    await waitFor(() => expect(field.props.value).toBe('Sam'));

    fireEvent.changeText(field, 'sam@example.com');
    fireEvent.press(screen.getByText('Save name'));
    expect(await screen.findByText("Use a name, not an email address (no '@').")).toBeTruthy();

    fireEvent.changeText(field, 'Sam I.');
    expect(screen.queryByText("Use a name, not an email address (no '@').")).toBeNull();
    fireEvent(field, 'submitEditing');
    await waitFor(() => expect(backend.profiles.get(SAM.id)).toBe('Sam I.'));
    expect(announce).toHaveBeenCalledWith('Name saved');
    expect(await screen.findAllByText('Sam I.')).toBeTruthy();
  });

  it("doesn't hand one camper's unsaved name to the next camper", async () => {
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    connectServer(backend);
    await renderApp('/account');
    fireEvent.changeText(await screen.findByLabelText('Display name'), 'Sammy the camper');
    fireEvent.press(screen.getByText('Sign out'));
    expect(await screen.findByText('Add the spots you know')).toBeTruthy();
    act(() => backend.auth.setUser(ALEX));
    const field = await screen.findByLabelText('Display name');
    await waitFor(() => expect(field.props.value).toBe('Alex'));
  });

  it('signs out', async () => {
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    connectServer(backend);
    await renderApp('/account');
    fireEvent.press(await screen.findByText('Sign out'));
    expect(await screen.findByText('Add the spots you know')).toBeTruthy();
  });

  it('says when signing out fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const alerts = spyOnAlerts();
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    connectServer(backend);
    await renderApp('/account');
    backend.auth.signOut.mockResolvedValueOnce({ error: { message: 'Network request failed' } });
    fireEvent.press(await screen.findByText('Sign out'));
    await waitFor(() => expect(alerts.lastTitle()).toBe("Couldn't sign out"));
  });

  it('deletes the account after a warning, keeping the spots without a name', async () => {
    const alerts = spyOnAlerts();
    const backend = fakeBackend([SAMS_SPOT]);
    backend.auth.setUser(SAM);
    connectServer(backend);
    await renderApp('/account');
    fireEvent.press(await screen.findByText('Delete account'));
    expect(alerts.lastTitle()).toBe('Delete your account?');
    expect(alerts.alert.mock.calls.at(-1)?.[1]).toMatch(/Spots you added stay on the map without your name/);

    alerts.press('Cancel');
    expect(backend.rpc).not.toHaveBeenCalledWith('delete_my_account');

    fireEvent.press(screen.getByText('Delete account'));
    await act(async () => alerts.press('Delete account'));
    await waitFor(() => expect(alerts.lastTitle()).toBe('Account deleted'));
    expect(backend.rpc).toHaveBeenCalledWith('delete_my_account');
    expect(backend.spots.get('sams-spot')?.created_by).toBeNull();
    expect(await screen.findByText('Add the spots you know')).toBeTruthy();
  });

  it('says when deleting the account fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const alerts = spyOnAlerts();
    const backend = fakeBackend();
    backend.auth.setUser(SAM);
    connectServer(backend);
    await renderApp('/account');
    backend.intercept = (query) =>
      query.op === 'rpc' ? Promise.resolve({ data: null, error: { message: 'boom' } }) : undefined;
    fireEvent.press(await screen.findByText('Delete account'));
    await act(async () => alerts.press('Delete account'));
    await waitFor(() => expect(alerts.lastTitle()).toBe("Couldn't delete your account"));
    expect(screen.getByText('Signed in as')).toBeTruthy();
  });
});
