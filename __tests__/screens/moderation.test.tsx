// Reporting, blocking, the terms of use and hidden spots, end to end in the
// real app (App Store Guideline 1.2).

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { LEGAL_URLS, TERMS_VERSION } from '@/config';

import { ALEX, fakeBackend, NEWBIE, SAM, type FakeUser } from '../../test/fakeSupabase';
import { makeRow } from '../../test/fixtures';
import { connectServer, resetServer, spyOnAlerts } from '../../test/helpers';
import { renderApp } from '../../test/renderApp';

// Pinned to Smoky Gardens only: see test/mocks/seedSpots.ts.
jest.mock('@/data/seedSpots', () => jest.requireActual('../../test/mocks/seedSpots'));

const ALEX_SPOT = makeRow({
  id: 'alex-spot',
  name: 'Alex Hollow',
  created_by: ALEX.id,
  added_by: 'Alex',
  created_at: '2026-10-07T12:00:00+00:00',
  verified: false,
  report_count: 0,
});

const SAMS_SPOT = makeRow({
  id: 'sams-spot',
  name: 'Sam Flat',
  created_by: SAM.id,
  added_by: 'Sam',
  created_at: '2026-10-07T12:00:00+00:00',
  verified: false,
  report_count: 0,
});

function server(user: FakeUser | null = SAM, rows = [makeRow(), ALEX_SPOT, SAMS_SPOT]) {
  const backend = fakeBackend(rows);
  backend.auth.setUser(ALEX);
  backend.auth.setUser(user);
  connectServer(backend);
  return backend;
}

afterEach(() => {
  resetServer();
  jest.restoreAllMocks();
});

describe('Reporting', () => {
  it('reports a spot, then offers to block the camper who added it', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    const app = await renderApp('/spot/alex-spot');
    expect(await screen.findByText('Something wrong?')).toBeTruthy();
    fireEvent.press(screen.getByText('Report this spot'));
    await waitFor(() => expect(app.getPathname()).toBe('/report/spot/alex-spot'));
    expect(screen.getByText(/Tell us what's wrong with “Alex Hollow”/)).toBeTruthy();

    // A reason is needed.
    fireEvent.press(screen.getByText('Send report'));
    expect(await screen.findByText('Choose what’s wrong.')).toBeTruthy();
    expect(backend.flags).toHaveLength(0);

    fireEvent.press(screen.getByText('Not a real spot, or in the wrong place'));
    fireEvent.changeText(screen.getByLabelText('Anything else we should know?'), 'Nothing here but a cliff');
    fireEvent.press(screen.getByText('Send report'));
    expect(await screen.findByText('Thanks for reporting')).toBeTruthy();
    expect(backend.flags).toEqual([
      { reporter: SAM.id, spotId: 'alex-spot', reason: 'fake', details: 'Nothing here but a cliff', status: 'open' },
    ]);

    fireEvent.press(screen.getByText('Block Alex'));
    expect(alerts.lastTitle()).toBe('Block Alex?');
    await act(async () => alerts.press('Block'));
    expect(await screen.findByText("Blocked. You won't see spots or photos from Alex.")).toBeTruthy();
    expect(backend.blocks.get(SAM.id)?.has(ALEX.id)).toBe(true);
    expect(screen.queryByText('Block Alex')).toBeNull();

    // Alex's spot is gone for Sam now, so Done goes back to Explore.
    fireEvent.press(screen.getByText('Done'));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });

  it('says so when the camper already reported it', async () => {
    const backend = server();
    backend.flags.push({ reporter: SAM.id, spotId: 'row-spot', reason: 'spam', status: 'open' });
    await renderApp('/report/spot/row-spot');
    fireEvent.press(await screen.findByText('Spam or advertising'));
    fireEvent.press(screen.getByText('Send report'));
    expect(await screen.findByText('Already reported')).toBeTruthy();
    // A starter spot has no camper to block.
    expect(screen.queryByText(/^Block/)).toBeNull();
  });

  it('reports a camper’s name from their spot', async () => {
    const backend = server();
    const app = await renderApp('/spot/alex-spot');
    fireEvent.press(await screen.findByText('Report the name “Alex”'));
    await waitFor(() => expect(app.getPathname()).toBe(`/report/camper/${ALEX.id}`));
    expect(screen.getByText('Report this name')).toBeTruthy();
    expect(screen.queryByText('Not a real spot, or in the wrong place')).toBeNull();
    fireEvent.press(screen.getByText('Offensive or abusive name'));
    fireEvent.press(screen.getByText('Send report'));
    expect(await screen.findByText('Thanks for reporting')).toBeTruthy();
    expect(backend.flags[0]).toMatchObject({ camperId: ALEX.id, reason: 'offensive' });
  });

  it('explains a report that couldn’t be sent', async () => {
    const backend = server();
    await renderApp('/report/spot/alex-spot');
    backend.intercept = (query) =>
      query.table === 'flags'
        ? Promise.resolve({ data: null, error: { message: 'Network request failed' } })
        : undefined;
    fireEvent.press(await screen.findByText('Offensive or abusive'));
    fireEvent.press(screen.getByText('Send report'));
    expect(await screen.findByText("You're offline. Try again when you have signal.")).toBeTruthy();
  });

  it('asks signed-out campers to sign in, and comes back', async () => {
    server(null);
    const app = await renderApp('/report/spot/alex-spot');
    expect(await screen.findByText(/Sign in to send a report/)).toBeTruthy();
    fireEvent.press(screen.getByText('Sign in'));
    await waitFor(() => expect(app.getPathname()).toBe('/sign-in'));
    fireEvent.press(screen.getByText('Continue with Google'));
    await waitFor(() => expect(app.getPathname()).toBe('/report/spot/alex-spot'));
    expect(await screen.findByText('Report this spot')).toBeTruthy();
  });

  it('handles a link to something it can’t report', async () => {
    server();
    await renderApp('/report/other/x');
    expect(await screen.findByText('Nothing to report')).toBeTruthy();
  });

  it('offers reporting on others’ spots only, and blocking only for campers', async () => {
    server();
    await renderApp('/spot/sams-spot');
    expect(await screen.findByText('Your spot')).toBeTruthy();
    expect(screen.queryByText('Something wrong?')).toBeNull();
    screen.unmount();
    await renderApp('/spot/row-spot');
    expect(await screen.findByText('Report this spot')).toBeTruthy();
    expect(screen.queryByText(/Report the name/)).toBeNull();
    expect(screen.queryByText(/^Block/)).toBeNull();
  });
});

describe('Blocking', () => {
  it('hides a camper’s spots right away and leaves their page', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    const app = await renderApp('/', { prefs: { view: 'list' } });
    expect(await screen.findByText('Alex Hollow')).toBeTruthy();
    fireEvent.press(screen.getByText('Alex Hollow'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/alex-spot'));

    fireEvent.press(await screen.findByText('Block Alex'));
    alerts.press('Cancel');
    expect(backend.blocks.size).toBe(0);
    fireEvent.press(screen.getByText('Block Alex'));
    await act(async () => alerts.press('Block'));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(screen.queryByText('Alex Hollow')).toBeNull();
    expect(screen.getByText('Sam Flat')).toBeTruthy();
  });

  it('explains a block that couldn’t be saved', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    await renderApp('/spot/alex-spot');
    backend.intercept = (query) =>
      query.table === 'blocks'
        ? Promise.resolve({ data: null, error: { message: 'Network request failed' } })
        : undefined;
    fireEvent.press(await screen.findByText('Block Alex'));
    await act(async () => alerts.press('Block'));
    await waitFor(() => expect(alerts.lastTitle()).toBe("Couldn't block"));
    expect(screen.getByText('Alex Hollow')).toBeTruthy();
  });

  it('asks signed-out campers to sign in first', async () => {
    server(null);
    const alerts = spyOnAlerts();
    const app = await renderApp('/spot/alex-spot');
    fireEvent.press(await screen.findByText('Block Alex'));
    expect(alerts.lastTitle()).toBe('Sign in to block campers');
    act(() => alerts.press('Sign in'));
    await waitFor(() => expect(app.getPathname()).toBe('/sign-in'));
  });

  it('lists blocked campers in Account, and unblocks them', async () => {
    const backend = server();
    backend.blocks.set(SAM.id, new Set([ALEX.id]));
    await renderApp('/account');
    expect(await screen.findByText('Blocked campers')).toBeTruthy();
    expect(await screen.findByText('Alex')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Unblock Alex'));
    expect(await screen.findByText(/Nobody\. To stop seeing a camper/)).toBeTruthy();
    expect(backend.blocks.get(SAM.id)?.size).toBe(0);
  });

  it('explains when the blocked list or an unblock fails', async () => {
    const backend = server();
    backend.blocks.set(SAM.id, new Set([ALEX.id]));
    const alerts = spyOnAlerts();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    backend.intercept = (query) =>
      query.table === 'rpc:my_blocks' ? Promise.resolve({ data: null, error: { message: 'boom' } }) : undefined;
    await renderApp('/account');
    expect(await screen.findByText("Couldn't load the campers you've blocked. Please try again.")).toBeTruthy();
    screen.unmount();

    backend.intercept = (query) =>
      query.table === 'blocks'
        ? Promise.resolve({ data: null, error: { message: 'Network request failed' } })
        : undefined;
    await renderApp('/account');
    fireEvent.press(await screen.findByLabelText('Unblock Alex'));
    await waitFor(() => expect(alerts.lastTitle()).toBe("Couldn't unblock"));
    expect(screen.getByText('Alex')).toBeTruthy();
  });
});

describe('Terms of use', () => {
  it('asks a new camper to agree before their first spot', async () => {
    const backend = server(NEWBIE);
    await renderApp('/spot/new');
    expect(await screen.findByText('Before you post')).toBeTruthy();
    expect(screen.getByText(/zero tolerance for objectionable content/)).toBeTruthy();
    expect(screen.getByText("You're 13 or older.")).toBeTruthy();

    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    fireEvent.press(screen.getByText('Read the full terms of use'));
    expect(open).toHaveBeenCalledWith(LEGAL_URLS.terms);

    fireEvent.press(screen.getByText('I agree'));
    expect(await screen.findByLabelText('Name, required')).toBeTruthy();
    expect(backend.terms.get(NEWBIE.id)).toBe(TERMS_VERSION);
  });

  it('lets the camper leave without agreeing', async () => {
    server(NEWBIE);
    const app = await renderApp('/');
    fireEvent.press(await screen.findByLabelText('Add a spot'));
    fireEvent.press(await screen.findByText('Not now'));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });

  it('explains when agreeing fails', async () => {
    const backend = server(NEWBIE);
    backend.intercept = (query) =>
      query.table === 'rpc:accept_terms'
        ? Promise.resolve({ data: null, error: { message: 'terms_outdated', code: 'P0001' } })
        : undefined;
    await renderApp('/spot/new');
    fireEvent.press(await screen.findByText('I agree'));
    expect(await screen.findByText(/DisCamp has new terms of use/)).toBeTruthy();
  });

  it('asks before editing too, for campers from before the terms', async () => {
    server({ ...SAM, termsVersion: null });
    await renderApp('/spot/edit/sams-spot');
    expect(await screen.findByText('Before you post')).toBeTruthy();
  });

  it('shows the terms again when the server says they changed', async () => {
    const backend = server();
    await renderApp('/spot/new');
    fireEvent.changeText(await screen.findByLabelText('Name, required'), 'Bluff Pull-off');
    fireEvent.changeText(screen.getByLabelText('Land manager, required'), 'National Forest');
    fireEvent.changeText(screen.getByLabelText('GPS location, required'), '46.653, -121.614');
    backend.terms.delete(SAM.id);
    fireEvent.press(screen.getByText('Add spot'));
    expect(await screen.findByText('Before you post')).toBeTruthy();
  });

  it('links the terms and privacy policy from sign-in', async () => {
    server(null);
    await renderApp('/sign-in');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    expect(await screen.findByText(/By continuing, you agree/)).toBeTruthy();
    fireEvent.press(screen.getByText('Privacy policy'));
    expect(open).toHaveBeenCalledWith(LEGAL_URLS.privacy);
  });
});

describe('Hidden spots', () => {
  it('keeps your own hidden spot off the map but tells you why on its page', async () => {
    server(SAM, [makeRow(), { ...SAMS_SPOT, hidden: true }]);
    await renderApp('/', { prefs: { view: 'list' } });
    expect(await screen.findByText('Row spot')).toBeTruthy();
    expect(screen.queryByText('Sam Flat')).toBeNull();

    act(() => router.push('/account'));
    fireEvent.press(await screen.findByText('Sam Flat'));
    expect(await screen.findByText(/Hidden while DisCamp reviews reports about it/)).toBeTruthy();
  });
});

describe('Help and contact', () => {
  it('shows legal links in Account, signed in or out, and without a server', async () => {
    server();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await renderApp('/account');
    expect(await screen.findByText('Help and contact')).toBeTruthy();
    fireEvent.press(screen.getByText('Terms of use'));
    expect(open).toHaveBeenCalledWith(LEGAL_URLS.terms);
    screen.unmount();

    server(null);
    await renderApp('/account');
    expect(await screen.findByText('Help and contact')).toBeTruthy();
    screen.unmount();

    connectServer(null);
    await renderApp('/account');
    expect(await screen.findByText('Help and contact')).toBeTruthy();
    fireEvent.press(screen.getByText('Support page'));
    expect(open).toHaveBeenCalledWith(LEGAL_URLS.support);
  });

  it('after deleting an Apple account, explains removing DisCamp from the Apple Account', async () => {
    const backend = server({ ...SAM, provider: 'apple' });
    // The apple-revoke function isn't set up, so Apple stays connected.
    backend.invoke.mockResolvedValueOnce({ data: { revoked: false, reason: 'not_configured' }, error: null });
    const alerts = spyOnAlerts();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await renderApp('/account');
    fireEvent.press(await screen.findByText('Delete account'));
    await act(async () => alerts.press('Delete account'));
    await waitFor(() => expect(alerts.lastTitle()).toBe('Account deleted'));
    expect(alerts.alert.mock.calls.at(-1)?.[1]).toMatch(/Sign in with Apple/);
    alerts.press("Apple's instructions");
    expect(open).toHaveBeenCalledWith('https://support.apple.com/102571');
    expect(await screen.findByText('Your DisCamp account is deleted')).toBeTruthy();
    expect(screen.getByText(/Choose DisCamp and tap Delete/)).toBeTruthy();

    // Signing in again (as anyone) clears the note.
    fireEvent.press(screen.getByText('Sign in'));
    fireEvent.press(await screen.findByText('Continue with Google'));
    expect(await screen.findByText('Signed in as')).toBeTruthy();
    act(() => router.push('/account'));
    expect(screen.queryByText('Your DisCamp account is deleted')).toBeNull();
  });

  it('explains why a spot under review can’t be deleted', async () => {
    const backend = server();
    backend.flags.push({ reporter: ALEX.id, spotId: 'sams-spot', reason: 'fake', status: 'open' });
    const alerts = spyOnAlerts();
    await renderApp('/spot/sams-spot');
    fireEvent.press(await screen.findByText('Delete spot'));
    await act(async () => alerts.press('Delete'));
    await waitFor(() => expect(alerts.lastTitle()).toBe("Couldn't delete the spot"));
    expect(alerts.alert.mock.calls.at(-1)?.[1]).toMatch(/being reviewed after reports/);
    expect(backend.spots.has('sams-spot')).toBe(true);
  });
});
