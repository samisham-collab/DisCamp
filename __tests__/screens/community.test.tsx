// Photos, "Still good" and change reports on a spot, end to end in the real app.

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import * as ImagePicker from 'expo-image-picker';
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { TERMS_VERSION } from '@/config';

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

const photoId = (n: number) => `00000000-0000-4000-8000-00000000f0${String(n).padStart(2, '0')}`;

function server(user: FakeUser | null = SAM) {
  const backend = fakeBackend([makeRow(), ALEX_SPOT]);
  backend.auth.setUser(ALEX);
  backend.auth.setUser(user);
  connectServer(backend);
  return backend;
}

/** A photo already on the spot, added by `by`. */
function photoBy(backend: ReturnType<typeof server>, by: FakeUser, n: number, extra: Record<string, unknown> = {}) {
  const path = `${by.id}/${photoId(n)}.jpg`;
  backend.files.set(path, { owner: by.id, bytes: 4 });
  backend.photos.set(photoId(n), {
    id: photoId(n),
    spot_id: 'alex-spot',
    path,
    width: 1600,
    height: 1200,
    created_by: by.id,
    created_at: '2026-10-08T12:00:00Z',
    hidden: false,
    ...extra,
  });
}

const textOf = () => JSON.stringify(screen.toJSON());

afterEach(() => {
  resetServer();
  jest.restoreAllMocks();
});

describe('Still good', () => {
  it('confirms a spot with one tap', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    await renderApp('/spot/alex-spot');
    expect(await screen.findByText('Were you here?')).toBeTruthy();
    expect(screen.getByText(/Not confirmed by a camper yet\. Tell other campers/)).toBeTruthy();

    fireEvent.press(screen.getByText('Still good'));
    await waitFor(() => expect(backend.checkins).toHaveLength(1));
    expect(backend.checkins[0]).toMatchObject({ spot_id: 'alex-spot', camper_id: SAM.id, kind: 'still_good' });
    expect(await screen.findByText(/Confirmed just now\. Tell other campers/)).toBeTruthy();
    await waitFor(() => expect(textOf()).toContain('you'));

    // Once a day is enough.
    fireEvent.press(screen.getByText('Still good'));
    await waitFor(() => expect(alerts.lastTitle()).toBe('Already counted'));
    expect(alerts.alert.mock.calls.at(-1)?.[1]).toBe("You've already said that about this spot today. Thanks!");
  });

  it('lets other campers confirm the spots you add', async () => {
    const backend = server();
    backend.spots.set('sams-spot', makeRow({ id: 'sams-spot', name: 'Sam Flat', created_by: SAM.id, added_by: 'Sam' }));
    await renderApp('/spot/sams-spot');
    expect(await screen.findByText(/You added this spot, so other campers confirm it/)).toBeTruthy();
    expect(screen.queryByText('Still good')).toBeNull();
    expect(screen.getByText('Something changed')).toBeTruthy();
  });

  it('explains a check-in that could not be sent', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    await renderApp('/spot/alex-spot');
    backend.intercept = (query) =>
      query.table === 'checkins' && query.op === 'insert'
        ? Promise.resolve({ data: null, error: { message: 'Network request failed' } })
        : undefined;
    fireEvent.press(await screen.findByText('Still good'));
    await waitFor(() => expect(alerts.lastTitle()).toBe("Couldn't send that"));
  });

  it('shows what campers said, newest first, with their notes', async () => {
    const backend = server();
    backend.checkins.push(
      {
        id: 1,
        spot_id: 'alex-spot',
        camper_id: ALEX.id,
        kind: 'still_good',
        note: null,
        created_at: '2026-10-01T00:00:00Z',
      },
      {
        id: 2,
        spot_id: 'alex-spot',
        camper_id: null,
        kind: 'trash',
        note: 'Bags by the fire ring',
        created_at: '2026-10-02T00:00:00Z',
      },
    );
    await renderApp('/spot/alex-spot');
    expect(await screen.findByText('Bags by the fire ring')).toBeTruthy();
    const text = textOf();
    expect(text).toContain('Trash or damage at the site');
    expect(text).toContain('a camper');
    expect(text).toContain('Alex');
    expect(text.indexOf('Trash or damage at the site')).toBeLessThan(
      text.indexOf('"Still good"', text.indexOf('Recent')),
    );
  });

  it("reports another camper's note, then offers to block them", async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    backend.checkins.push(
      {
        id: 1,
        spot_id: 'alex-spot',
        camper_id: ALEX.id,
        kind: 'trash',
        note: 'Rude words here',
        created_at: '2026-10-01T00:00:00Z',
      },
      {
        id: 2,
        spot_id: 'alex-spot',
        camper_id: ALEX.id,
        kind: 'still_good',
        note: null,
        created_at: '2026-10-02T00:00:00Z',
      },
      {
        id: 3,
        spot_id: 'alex-spot',
        camper_id: SAM.id,
        kind: 'other',
        note: 'My own note',
        created_at: '2026-10-03T00:00:00Z',
      },
    );
    const app = await renderApp('/spot/alex-spot');
    expect(await screen.findByText('My own note')).toBeTruthy();
    // Only other campers' check-ins can be reported.
    expect(screen.getAllByLabelText(/^Report this check-in/)).toHaveLength(2);
    fireEvent.press(screen.getAllByLabelText('Report this check-in from Alex')[1]!);
    await waitFor(() => expect(app.getPathname()).toBe('/report/checkin/1'));
    expect(screen.getByText('Report this check-in')).toBeTruthy();
    expect(screen.getByText(/Tell us what's wrong with this check-in/)).toBeTruthy();
    fireEvent.press(screen.getByText('Offensive or abusive'));
    fireEvent.press(screen.getByText('Send report'));
    expect(await screen.findByText('Thanks for reporting')).toBeTruthy();
    expect(backend.flags).toEqual([{ reporter: SAM.id, checkinId: 1, reason: 'offensive', status: 'open' }]);
    fireEvent.press(screen.getByText('Block Alex'));
    await act(async () => alerts.press('Block'));
    await waitFor(() => expect(backend.blocks.get(SAM.id)?.has(ALEX.id)).toBe(true));
  });

  it('says so when a check-in link is broken or the check-in is gone', async () => {
    server();
    await renderApp('/report/checkin/abc');
    expect(await screen.findByText('Nothing to report')).toBeTruthy();
  });

  it('keeps going without the list when it cannot load', async () => {
    const backend = server();
    backend.intercept = (query) =>
      query.table === 'checkins_api'
        ? Promise.resolve({ data: null, error: { message: 'Failed to fetch' } })
        : undefined;
    await renderApp('/spot/alex-spot');
    expect(await screen.findByText('Were you here?')).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText('Loading check-ins')).toBeNull());
  });

  it('asks signed-out campers to sign in first, and comes back', async () => {
    const backend = server(null);
    const app = await renderApp('/spot/alex-spot');
    fireEvent.press(await screen.findByText('Still good'));
    await waitFor(() => expect(app.getPathname()).toBe('/sign-in'));
    fireEvent.press(screen.getByText('Continue with Google'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/alex-spot'));
    expect(backend.checkins).toHaveLength(0);
  });

  it('shows the community rules to campers who have not agreed yet', async () => {
    const backend = server(NEWBIE);
    const app = await renderApp('/spot/alex-spot');
    fireEvent.press(await screen.findByText('Still good'));
    await waitFor(() => expect(app.getPathname()).toBe('/rules'));
    fireEvent.press(await screen.findByText('I agree'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/alex-spot'));
    expect(backend.terms.get(NEWBIE.id)).toBeGreaterThan(0);
    expect(backend.checkins).toHaveLength(0);
  });

  it('opens the rules on their own, and goes home once agreed with nowhere to go back to', async () => {
    server(NEWBIE);
    const app = await renderApp('/rules');
    fireEvent.press(await screen.findByText('I agree'));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });

  it('asks for an account on the rules screen when signed out', async () => {
    server(null);
    await renderApp('/rules');
    expect(await screen.findByText(/Posting needs an account/)).toBeTruthy();
  });
});

describe('On the map and in the list', () => {
  it('shows the newest change campers reported, or when a spot was last confirmed', async () => {
    const backend = fakeBackend([
      makeRow({ alerts: [{ kind: 'road_damage', at: new Date(Date.now() - 2 * 86_400_000).toISOString() }] }),
      { ...ALEX_SPOT, last_confirmed_at: new Date(Date.now() - 3 * 86_400_000).toISOString() },
    ]);
    connectServer(backend);
    await renderApp('/', { prefs: { view: 'list' } });
    const changed = await screen.findByTestId('spot-item-row-spot');
    expect(within(changed).getByText('Road washed out or damaged, 2 days ago')).toBeTruthy();
    expect(changed.props.accessibilityLabel).toContain('Camper reported: Road washed out or damaged, 2 days ago');
    const confirmed = screen.getByTestId('spot-item-alex-spot');
    expect(within(confirmed).getByText('Confirmed 3 days ago')).toBeTruthy();
    expect(confirmed.props.accessibilityLabel).toContain('Confirmed 3 days ago');

    fireEvent.press(screen.getByText('Map'));
    fireEvent.press(await screen.findByTestId('marker-row-spot'));
    const card = await screen.findByTestId('spot-summary');
    expect(within(card).getByText('Road washed out or damaged, 2 days ago')).toBeTruthy();
  });
});

describe('Something changed', () => {
  it('reports a change, which shows on the spot until someone says it is still good', async () => {
    const backend = server();
    const app = await renderApp('/spot/alex-spot');
    fireEvent.press(await screen.findByText('Something changed'));
    await waitFor(() => expect(app.getPathname()).toBe('/checkin/alex-spot'));
    expect(screen.getByText('What changed?')).toBeTruthy();

    fireEvent.press(screen.getByText('Send'));
    expect(await screen.findByText('Choose what changed.')).toBeTruthy();
    fireEvent.press(screen.getByText('Gate locked or road closed'));
    fireEvent.changeText(screen.getByLabelText('Details'), 'what the fuck');
    expect(await screen.findByText("Some words aren't allowed on DisCamp.")).toBeTruthy();
    fireEvent.press(screen.getByText('Send'));
    expect(backend.checkins).toHaveLength(0);

    fireEvent.changeText(screen.getByLabelText('Details'), 'New gate at the cattle guard');
    fireEvent.press(screen.getByText('Send'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/alex-spot'));
    expect(backend.checkins[0]).toMatchObject({ kind: 'gate_closed', note: 'New gate at the cattle guard' });
    expect(await screen.findByText('Gate locked or road closed: reported just now. Check before you go.')).toBeTruthy();

    // Another camper's "Still good" clears it.
    backend.terms.set(NEWBIE.id, TERMS_VERSION);
    act(() => backend.auth.setUser(NEWBIE));
    fireEvent.press(await screen.findByText('Still good'));
    await waitFor(() =>
      expect(screen.queryByText('Gate locked or road closed: reported just now. Check before you go.')).toBeNull(),
    );
  });

  it('shows why a change report was not sent, and cancels', async () => {
    const backend = server();
    const app = await renderApp('/spot/alex-spot');
    fireEvent.press(await screen.findByText('Something changed'));
    await waitFor(() => expect(app.getPathname()).toBe('/checkin/alex-spot'));
    backend.banned.add(SAM.id);
    fireEvent.press(screen.getByText('Camping closed here now'));
    fireEvent.press(screen.getByText('Send'));
    expect(await screen.findByText(/account/i)).toBeTruthy();
    fireEvent.press(screen.getByText('Cancel'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/alex-spot'));
  });

  it('says so when the spot is gone', async () => {
    server();
    await renderApp('/checkin/nope');
    expect(await screen.findByText('Spot not found')).toBeTruthy();
  });

  it('asks for an account first', async () => {
    server(null);
    await renderApp('/checkin/alex-spot');
    expect(await screen.findByText(/Reporting a change needs an account/)).toBeTruthy();
  });

  it('asks campers to agree to the rules first', async () => {
    server(NEWBIE);
    await renderApp('/checkin/alex-spot');
    expect(await screen.findByText('I agree')).toBeTruthy();
  });
});

describe('Photos', () => {
  it('takes a photo, adds it to the spot, and deletes it', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    await renderApp('/spot/alex-spot');
    expect(await screen.findByText('No photos yet. Be the first to add one.')).toBeTruthy();

    fireEvent.press(screen.getByText('Add a photo'));
    expect(alerts.lastTitle()).toBe('Add a photo');
    await act(async () => alerts.press('Take a photo'));
    expect(await screen.findByLabelText('Photo 1 of 1, by Sam')).toBeTruthy();
    expect(backend.photos.size).toBe(1);
    const [path] = [...backend.files.keys()];
    expect(path).toMatch(new RegExp(`^${SAM.id}/[0-9a-f-]{36}\\.jpg$`));

    fireEvent.press(screen.getByLabelText('Photo 1 of 1, by Sam'));
    expect(await screen.findByText(/Added by you/)).toBeTruthy();
    expect(screen.queryByLabelText('Report')).toBeNull();
    fireEvent.press(screen.getByLabelText('Delete'));
    expect(alerts.lastTitle()).toBe('Delete this photo?');
    await act(async () => alerts.press('Delete'));
    expect(await screen.findByText('No photos yet. Be the first to add one.')).toBeTruthy();
    expect(backend.photos.size).toBe(0);
    expect(backend.files.size).toBe(0);
  });

  it('chooses one from the library, and does nothing when the camper backs out', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    await renderApp('/spot/alex-spot');
    fireEvent.press(await screen.findByText('Add a photo'));
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: true, assets: null });
    await act(async () => alerts.press('Choose from library'));
    expect(backend.photos.size).toBe(0);
    expect(alerts.alert).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByText('Add a photo'));
    await act(async () => alerts.press('Choose from library'));
    expect(await screen.findByLabelText('Photo 1 of 1, by Sam')).toBeTruthy();
  });

  it('offers Settings when the camera is off', async () => {
    server();
    const alerts = spyOnAlerts();
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    jest
      .mocked(ImagePicker.requestCameraPermissionsAsync)
      .mockResolvedValueOnce({ granted: false, status: 'denied', canAskAgain: false } as never);
    await renderApp('/spot/alex-spot');
    fireEvent.press(await screen.findByText('Add a photo'));
    await act(async () => alerts.press('Take a photo'));
    await waitFor(() => expect(alerts.lastTitle()).toBe('Camera is off for DisCamp'));
    alerts.press('Open Settings');
    expect(openSettings).toHaveBeenCalled();
  });

  it('explains a photo that could not be opened or sent', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await renderApp('/spot/alex-spot');
    jest.mocked(ImagePicker.launchCameraAsync).mockRejectedValueOnce(new Error('No camera'));
    fireEvent.press(await screen.findByText('Add a photo'));
    await act(async () => alerts.press('Take a photo'));
    await waitFor(() => expect(alerts.lastTitle()).toBe("Couldn't open that photo"));

    backend.storageIntercept = () => Promise.resolve({ data: null, error: { message: 'Network request failed' } });
    fireEvent.press(screen.getByText('Add a photo'));
    await act(async () => alerts.press('Take a photo'));
    await waitFor(() => expect(alerts.lastTitle()).toBe("Couldn't add the photo"));
    expect(backend.photos.size).toBe(0);
  });

  it('tries the same photo again after a lost connection, without adding it twice', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    await renderApp('/spot/alex-spot');
    backend.storageIntercept = () => Promise.resolve({ data: null, error: { message: 'Network request failed' } });
    fireEvent.press(await screen.findByText('Add a photo'));
    await act(async () => alerts.press('Take a photo'));
    await waitFor(() => expect(alerts.lastTitle()).toBe("Couldn't add the photo"));
    backend.storageIntercept = null;
    await act(async () => alerts.press('Try again'));
    expect(await screen.findByLabelText('Photo 1 of 1, by Sam')).toBeTruthy();
    const uploads = backend.storageCalls.filter((c) => c.op === 'upload').map((c) => c.paths[0]);
    expect(uploads).toHaveLength(2);
    expect(uploads[0]).toBe(uploads[1]);
  });

  it('stops offering to add after three of your own', async () => {
    const backend = server();
    for (const n of [1, 2, 3]) photoBy(backend, SAM, n);
    await renderApp('/spot/alex-spot');
    expect(await screen.findByText("You've added 3 photos here, the most for one camper.")).toBeTruthy();
    expect(screen.queryByText('Add a photo')).toBeNull();
  });

  it('marks your own photo while it is reviewed, and says why it cannot be deleted', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    photoBy(backend, SAM, 1, { hidden: true });
    await renderApp('/spot/alex-spot');
    fireEvent.press(await screen.findByLabelText('Photo 1 of 1, by Sam'));
    expect(await screen.findByText(/hidden while it’s reviewed/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Delete'));
    await act(async () => alerts.press('Delete'));
    await waitFor(() => expect(alerts.lastTitle()).toBe("Couldn't delete the photo"));
    fireEvent.press(screen.getByLabelText('Close'));
    await waitFor(() => expect(screen.queryByText(/hidden while it’s reviewed/)).toBeNull());
  });

  it("reports someone else's photo", async () => {
    const backend = server();
    photoBy(backend, ALEX, 1);
    const app = await renderApp('/spot/alex-spot');
    fireEvent.press(await screen.findByLabelText('Photo 1 of 1, by Alex'));
    expect(await screen.findByText(/Added by Alex on Oct 8, 2026/)).toBeTruthy();
    expect(screen.queryByLabelText('Delete')).toBeNull();
    fireEvent.press(screen.getByLabelText('Report'));
    await waitFor(() => expect(app.getPathname()).toBe(`/report/photo/${photoId(1)}`));
    expect(screen.getByText('Report this photo')).toBeTruthy();
    fireEvent.press(screen.getByText('Not a photo of this spot'));
    fireEvent.press(screen.getByText('Send report'));
    expect(await screen.findByText('Thanks for reporting')).toBeTruthy();
    expect(backend.flags).toEqual([{ reporter: SAM.id, photoId: photoId(1), reason: 'fake', status: 'open' }]);
    expect(screen.getByText('Block Alex')).toBeTruthy();
  });

  it('blocks the camper who added a photo, and their photos go', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    photoBy(backend, ALEX, 1);
    photoBy(backend, NEWBIE, 2);
    await renderApp('/spot/alex-spot');
    fireEvent.press(await screen.findByLabelText('Photo 1 of 2, by Alex'));
    fireEvent.press(await screen.findByLabelText('Block'));
    expect(alerts.lastTitle()).toBe('Block Alex?');
    await act(async () => alerts.press('Block'));
    await waitFor(() => expect(backend.blocks.get(SAM.id)?.has(ALEX.id)).toBe(true));
    // Alex added this spot too, so it goes for Sam: back to Explore.
    await waitFor(() => expect(screen.queryByLabelText(/by Alex/)).toBeNull());
  });

  it('tries again after photos fail to load', async () => {
    const backend = server();
    photoBy(backend, ALEX, 1);
    backend.intercept = (query) =>
      query.table === 'spot_photos_api'
        ? Promise.resolve({ data: null, error: { message: 'Failed to fetch' } })
        : undefined;
    await renderApp('/spot/alex-spot');
    expect(await screen.findByText("You're offline. Try again when you have signal.")).toBeTruthy();
    backend.intercept = null;
    fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByLabelText('Photo 1 of 1, by Alex')).toBeTruthy();
  });

  it('shows photos to signed-out campers without names it does not have', async () => {
    const backend = server(null);
    photoBy(backend, ALEX, 1);
    backend.profiles.delete(ALEX.id);
    await renderApp('/spot/alex-spot');
    fireEvent.press(await screen.findByLabelText('Photo 1 of 1'));
    expect(await screen.findByText(/Added by a camper on Oct 8, 2026/)).toBeTruthy();
  });
});
