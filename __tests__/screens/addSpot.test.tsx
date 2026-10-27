// Adding, editing and deleting spots, end to end in the real app.

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { STORAGE_KEYS } from '@/config';
import { kvStore } from '@/lib/kvStore';

import { ALEX, fakeBackend, SAM, type QueryResult } from '../../test/fakeSupabase';
import { makeRow } from '../../test/fixtures';
import { connectServer, resetServer, spyOnAlerts } from '../../test/helpers';
import { GOODLAND } from '../../test/mocks/expoLocation';
import { mapMethods } from '../../test/mocks/reactNativeMaps';
import { renderApp } from '../../test/renderApp';

// Pinned to Smoky Gardens only: see test/mocks/seedSpots.ts.
jest.mock('@/data/seedSpots', () => jest.requireActual('../../test/mocks/seedSpots'));

const SAMS_SPOT = makeRow({
  id: 'sams-spot',
  name: 'Sam Flat',
  latitude: 42.3241,
  longitude: -113.0467,
  created_by: SAM.id,
  added_by: 'Sam',
  created_at: '2026-10-07T12:00:00+00:00',
  verified: false,
  report_count: 0,
  nightly_fee_usd: 0,
  rv_fee_usd: null,
  hookups: [],
});

function signedIn(rows = [makeRow(), SAMS_SPOT], user = SAM) {
  const backend = fakeBackend(rows);
  backend.auth.setUser(user);
  connectServer(backend);
  return backend;
}

const field = (label: string) => screen.getByLabelText(label);

async function fillRequired() {
  fireEvent.changeText(await screen.findByLabelText('Name, required'), 'Bluff Pull-off');
  fireEvent.changeText(field('Land manager, required'), 'National Forest');
  fireEvent.changeText(field('GPS location, required'), '46.653, -121.614');
}

describe('Adding a spot', () => {
  afterEach(() => {
    resetServer();
    jest.restoreAllMocks();
  });

  it('adds a spot that shows for everyone, marked as yours', async () => {
    const backend = signedIn();
    const app = await renderApp('/spot/new');
    await fillRequired();
    fireEvent.press(screen.getByText('Dispersed'));
    fireEvent.press(screen.getByText('C3 · 6–8"'));
    expect(screen.getByText('Ruts, small rocks, washboard')).toBeTruthy();
    fireEvent.press(screen.getAllByText('Free')[0]!);
    fireEvent.press(screen.getByText('Add spot'));

    await waitFor(() => expect(app.getPathname()).toMatch(/^\/spot\/[0-9a-f-]{36}$/));
    expect(await screen.findByText('Bluff Pull-off')).toBeTruthy();
    expect(screen.getByText('Added by you on Oct 7, 2026')).toBeTruthy();
    expect(screen.getByText(/Added by a camper, not yet confirmed/)).toBeTruthy();
    expect(screen.getByText('Your spot')).toBeTruthy();

    const [insert] = backend.writes('spots', 'insert');
    expect(insert?.payload).toMatchObject({
      name: 'Bluff Pull-off',
      location: 'SRID=4326;POINT(-121.614 46.653)',
      clearance_tier: 3,
      nightly_fee_usd: 0,
    });
    // The draft is cleared for next time.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });
    expect(JSON.parse((await kvStore.getItem(STORAGE_KEYS.spotDraft)) ?? '{}')).toMatchObject({ name: '' });
  });

  it('sends every detail the camper fills in', async () => {
    const backend = signedIn();
    await renderApp('/spot/new');
    await fillRequired();
    const choose = (group: string, option: string) =>
      fireEvent.press(within(screen.getByLabelText(group)).getByText(option));

    choose('Type', 'Campground');
    fireEvent.changeText(field('Stay limit (days)'), '14');
    choose('Clearance needed', 'C5 · 10–12"');
    choose('Drivetrain', '4WD required');
    fireEvent.changeText(field('Road'), 'Rocky two-track');
    choose("When it's wet", 'Impassable when wet');
    choose('Tent ground', 'Yes');
    choose('Rooftop tent (level parking)', 'Yes');
    choose('Van or truck camper', 'No');
    fireEvent.changeText(field('Longest trailer or RV (feet)'), '0');
    choose('Big rigs (40 ft and up)', 'No');
    choose('Room for a big rig to turn around', 'Not sure');
    choose('Nightly fee', 'Paid');
    fireEvent.changeText(field('Fee per night ($)'), '12');
    fireEvent.changeText(field('RV or hookup site fee ($)'), '25');
    choose('Hookups', 'Water');
    choose('Hookups', 'Electric');
    choose('Hookups', 'Water');
    choose('Reservations', 'First come, first served');
    fireEvent.changeText(field('Cost notes'), 'Cash only');
    fireEvent.changeText(field("What's there"), 'Fire ring\nVault toilet');
    fireEvent.changeText(field('Rules'), 'No fireworks');
    fireEvent.changeText(field('Directions'), 'Left at the cattle guard.');
    fireEvent.changeText(field("Land manager's phone"), '(360) 497-1103');
    fireEvent.press(screen.getByText('Add spot'));

    await waitFor(() => expect(backend.writes('spots', 'insert')).toHaveLength(1));
    expect(backend.writes('spots', 'insert')[0]?.payload).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: 'Bluff Pull-off',
      location: 'SRID=4326;POINT(-121.614 46.653)',
      site_type: 'campground',
      land_manager: 'National Forest',
      stay_limit_days: 14,
      clearance_tier: 5,
      drivetrain: '4wd-required',
      surface: 'Rocky two-track',
      impassable_when_wet: true,
      tent: true,
      rtt: true,
      van: false,
      max_trailer_ft: 0,
      big_rig: false,
      turnaround: null,
      nightly_fee_usd: 12,
      rv_fee_usd: 25,
      hookups: ['electric'],
      reservations: 'first-come',
      cost_notes: 'Cash only',
      amenities: ['Fire ring', 'Vault toilet'],
      rules: ['No fireworks'],
      directions: 'Left at the cattle guard.',
      phone: '(360) 497-1103',
    });
  });

  it('sends hookups as "not sure" unless the camper picks some or None', async () => {
    const backend = signedIn();
    await renderApp('/spot/new');
    await fillRequired();
    const hookups = () => within(screen.getByLabelText('Hookups'));
    fireEvent.press(hookups().getByText('Electric'));
    fireEvent.press(hookups().getByText('None'));
    fireEvent.press(screen.getByText('Add spot'));
    await waitFor(() => expect(backend.writes('spots', 'insert')).toHaveLength(1));
    expect(backend.writes('spots', 'insert')[0]?.payload).toMatchObject({ hookups: [] });
  });

  it('leaves hookups unreported when none are picked', async () => {
    const backend = signedIn();
    await renderApp('/spot/new');
    await fillRequired();
    fireEvent.press(within(screen.getByLabelText('Hookups')).getByText('None'));
    fireEvent.press(within(screen.getByLabelText('Hookups')).getByText('Water'));
    fireEvent.press(within(screen.getByLabelText('Hookups')).getByText('Water'));
    fireEvent.press(screen.getByText('Add spot'));
    await waitFor(() => expect(backend.writes('spots', 'insert')).toHaveLength(1));
    expect(backend.writes('spots', 'insert')[0]?.payload).toMatchObject({ hookups: null });
  });

  it('shows what to fix, and updates as fields are fixed', async () => {
    const backend = signedIn();
    await renderApp('/spot/new');
    fireEvent.press(await screen.findByText('Add spot'));
    expect(await screen.findByText('Fix the 3 fields marked in red, then try again.')).toBeTruthy();
    expect(screen.getByText('Give the spot a name.')).toBeTruthy();
    expect(screen.getByText('Drop a pin or enter the GPS location.')).toBeTruthy();

    fireEvent.changeText(field('Name, required'), 'Bluff Pull-off');
    expect(screen.getByText('Fix the 2 fields marked in red, then try again.')).toBeTruthy();

    // A refused save scrolls up to the first card with a problem.
    // React Native's test stand-in for ScrollView shares one scrollTo mock.
    const scrollTo = jest.mocked(ScrollView.prototype.scrollTo);
    fireEvent(screen.getByTestId('section-where'), 'layout', { nativeEvent: { layout: { y: 0 } } });
    fireEvent(screen.getByTestId('section-about'), 'layout', { nativeEvent: { layout: { y: 420 } } });
    fireEvent.changeText(field('GPS location, required'), '46.653, -121.614');
    fireEvent.press(screen.getByText('Add spot'));
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ y: 412, animated: true }));
    fireEvent.changeText(field('Land manager, required'), 'BLM');
    fireEvent.changeText(field('Stay limit (days)'), 'forever');
    expect(screen.getByText('Fix the field marked in red, then try again.')).toBeTruthy();
    expect(backend.writes('spots')).toHaveLength(0);
  });

  it('keeps the draft if the camper leaves and comes back', async () => {
    signedIn();
    await renderApp('/spot/new');
    fireEvent.changeText(await screen.findByLabelText('Name, required'), 'Half-finished spot');
    fireEvent.press(screen.getByText('Paid'));
    fireEvent.changeText(field('Fee per night ($)'), '15');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });
    screen.unmount();

    await renderApp('/spot/new');
    expect((await screen.findByLabelText('Name, required')).props.value).toBe('Half-finished spot');
    expect(field('Fee per night ($)').props.value).toBe('15');
  });

  it('discards a draft after asking', async () => {
    const alerts = spyOnAlerts();
    signedIn();
    await renderApp('/spot/new');
    expect(screen.queryByText('Discard draft')).toBeNull();
    fireEvent.changeText(await screen.findByLabelText('Name, required'), 'Oops');
    fireEvent.press(screen.getByText('Discard draft'));
    alerts.press('Keep editing');
    expect(field('Name, required').props.value).toBe('Oops');
    fireEvent.press(screen.getByText('Discard draft'));
    act(() => alerts.press('Discard'));
    expect(field('Name, required').props.value).toBe('');
  });

  it('warns about a spot that is already on the map', async () => {
    signedIn();
    const app = await renderApp('/spot/new');
    fireEvent.changeText(await screen.findByLabelText('GPS location, required'), '42.3242, -113.0466');
    expect(await screen.findByText(/Sam Flat is .* away\. If it's the same place/)).toBeTruthy();
    fireEvent.press(screen.getByText('Open it'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/sams-spot'));
  });

  it('fills the GPS from the camper’s location', async () => {
    // The location stand-in asks for permission, gets it, and finds Goodland.
    signedIn();
    await renderApp('/spot/new');
    fireEvent.press(await screen.findByText('Use my location'));
    await waitFor(() =>
      expect(field('GPS location, required').props.value).toBe(
        `${GOODLAND.latitude.toFixed(5)}, ${GOODLAND.longitude.toFixed(5)}`,
      ),
    );
  });

  it('drops a pin on a map', async () => {
    signedIn();
    await renderApp('/spot/new');
    fireEvent.press(await screen.findByText('Drop a pin'));
    expect(await screen.findByText('Drop the pin')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Show standard map'));
    expect(screen.getByLabelText('Show satellite map')).toBeTruthy();
    fireEvent(screen.getByTestId('location-picker-map'), 'regionChangeComplete', {
      latitude: 46.58,
      longitude: -121.67,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
    expect(screen.getByText('46.58000, -121.67000')).toBeTruthy();
    fireEvent.press(screen.getByText('Use this location'));
    await waitFor(() => expect(screen.queryByText('Drop the pin')).toBeNull());
    expect(field('GPS location, required').props.value).toBe('46.58000, -121.67000');

    // "Go to my location" moves the map to the camper.
    fireEvent.press(screen.getByText('Drop a pin'));
    fireEvent.press(await screen.findByLabelText('Go to my location'));
    await waitFor(() =>
      expect(mapMethods.animateToRegion).toHaveBeenCalledWith(expect.objectContaining(GOODLAND), 400),
    );
    fireEvent.press(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Drop the pin')).toBeNull());

    // Cancel leaves the pin alone.
    fireEvent.press(screen.getByText('Drop a pin'));
    fireEvent.press(await screen.findByText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Drop the pin')).toBeNull());
    expect(field('GPS location, required').props.value).toBe('46.58000, -121.67000');
  });

  it('keeps everything when the server says no', async () => {
    const backend = signedIn();
    backend.intercept = (query) =>
      query.op === 'insert'
        ? Promise.resolve({ data: null, error: { message: 'daily_limit', code: 'P0001' } })
        : undefined;
    const app = await renderApp('/spot/new');
    await fillRequired();
    fireEvent.press(screen.getByText('Add spot'));
    expect(await screen.findByText('You can add up to 20 spots a day. Try again tomorrow.')).toBeTruthy();
    expect(app.getPathname()).toBe('/spot/new');
    expect(field('Name, required').props.value).toBe('Bluff Pull-off');
    // Changing something clears the message.
    fireEvent.changeText(field('Name, required'), 'Bluff Pull-off 2');
    expect(screen.queryByText('You can add up to 20 spots a day. Try again tomorrow.')).toBeNull();
  });

  it('reuses the same id when the camper tries again, so nothing is added twice', async () => {
    const backend = signedIn();
    let lose = true;
    // The first try is saved, but its answer is lost on the way back.
    backend.intercept = (query) => {
      if (query.op !== 'insert' || !lose) return undefined;
      lose = false;
      backend.intercept = null;
      void backend.run(query);
      return Promise.resolve({ data: null, error: { message: 'Network request failed' } });
    };
    const app = await renderApp('/spot/new');
    await fillRequired();
    fireEvent.press(screen.getByText('Add spot'));
    expect(await screen.findByText(/You're offline\. Your changes are still here/)).toBeTruthy();

    fireEvent.press(screen.getByText('Add spot'));
    await waitFor(() => expect(app.getPathname()).toMatch(/^\/spot\/[0-9a-f-]{36}$/));
    const inserts = backend.writes('spots', 'insert');
    expect(inserts).toHaveLength(2);
    expect(inserts[1]?.payload?.id).toBe(inserts[0]?.payload?.id);
    expect([...backend.spots.values()].filter((r) => r.name === 'Bluff Pull-off')).toHaveLength(1);
  });

  it('adds one spot for a quick double tap', async () => {
    const backend = signedIn();
    const app = await renderApp('/spot/new');
    await fillRequired();
    const add = screen.getByText('Add spot');
    // Both taps land before the screen updates.
    act(() => {
      fireEvent.press(add);
      fireEvent.press(add);
    });
    await waitFor(() => expect(app.getPathname()).toMatch(/^\/spot\/[0-9a-f-]{36}$/));
    expect(backend.writes('spots', 'insert')).toHaveLength(1);
    expect([...backend.spots.values()].filter((r) => r.name === 'Bluff Pull-off')).toHaveLength(1);
  });

  it('stays put if the camper leaves while it saves, and starts the next spot fresh', async () => {
    const backend = signedIn();
    let land: () => void = () => undefined;
    backend.intercept = (query) => {
      if (query.op !== 'insert') return undefined;
      backend.intercept = null;
      return new Promise<QueryResult>((resolve) => (land = () => void backend.run(query).then(resolve)));
    };
    const app = await renderApp('/spot/new');
    await fillRequired();
    fireEvent.press(screen.getByText('Add spot'));
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    await act(async () => {
      land();
      await jest.advanceTimersByTimeAsync(400);
    });
    // Saved, but the camper isn't pulled away from Explore.
    expect([...backend.spots.values()].some((r) => r.name === 'Bluff Pull-off')).toBe(true);
    expect(app.getPathname()).toBe('/');
    expect(JSON.parse((await kvStore.getItem(STORAGE_KEYS.spotDraft)) ?? '{}')).toMatchObject({
      name: '',
      clientId: '',
    });
  });

  it('starts fresh instead of showing a draft another camper left on this phone', async () => {
    const backend = signedIn();
    const theirs = '00000000-0000-4000-8000-00000000a1e7';
    await kvStore.setItem(
      STORAGE_KEYS.spotDraft,
      JSON.stringify({ clientId: theirs, ownerId: ALEX.id, name: 'Left Behind' }),
    );
    await renderApp('/spot/new');
    expect((await screen.findByLabelText('Name, required')).props.value).toBe('');
    fireEvent.changeText(field('Name, required'), 'My Own Flat');
    fireEvent.changeText(field('Land manager, required'), 'BLM');
    fireEvent.changeText(field('GPS location, required'), '46.653, -121.614');
    fireEvent.press(screen.getByText('Add spot'));
    await waitFor(() => expect(backend.writes('spots', 'insert')).toHaveLength(1));
    expect(backend.writes('spots', 'insert')[0]?.payload?.id).not.toBe(theirs);
  });

  it('asks a signed-out camper to sign in first', async () => {
    connectServer(fakeBackend());
    const app = await renderApp('/spot/new');
    expect(await screen.findByText('Sign in first')).toBeTruthy();
    fireEvent.press(screen.getByText('Sign in'));
    await waitFor(() => expect(app.getPathname()).toBe('/sign-in'));
  });

  it('says adding spots needs a server', async () => {
    await renderApp('/spot/new');
    expect(screen.getByText("Adding a spot isn't available")).toBeTruthy();
  });

  it('opens straight to the form from Explore when signed in', async () => {
    signedIn();
    const app = await renderApp('/');
    fireEvent.press(await screen.findByLabelText('Add a spot'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/new'));
  });
});

describe('Your spots', () => {
  afterEach(() => {
    resetServer();
    jest.restoreAllMocks();
  });

  it('edits a spot you added', async () => {
    const backend = signedIn();
    const app = await renderApp('/spot/sams-spot');
    fireEvent.press(await screen.findByText('Edit spot'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/edit/sams-spot'));
    expect(field('Name, required').props.value).toBe('Sam Flat');
    expect(field('GPS location, required').props.value).toBe('42.32410, -113.04670');
    expect(screen.queryByText('Discard draft')).toBeNull();

    fireEvent.changeText(field('Name, required'), 'Sam Flats');
    fireEvent.changeText(field('Stay limit (days)'), '10');
    fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/sams-spot'));
    expect(await screen.findByText('Sam Flats')).toBeTruthy();
    expect(screen.getByText(/10-day stay limit/)).toBeTruthy();
    expect(backend.writes('spots', 'update')[0]?.filters).toEqual([['id', 'sams-spot']]);
  });

  it('shows edit errors and server errors', async () => {
    const backend = signedIn();
    await renderApp('/spot/edit/sams-spot');
    fireEvent.changeText(await screen.findByLabelText('GPS location, required'), 'somewhere');
    fireEvent.press(screen.getByText('Save changes'));
    expect(await screen.findByText('Use decimal degrees, like 46.65300, -121.61400.')).toBeTruthy();

    fireEvent.changeText(field('GPS location, required'), '42.3241, -113.0467');
    backend.intercept = (query) =>
      query.op === 'update' ? Promise.resolve({ data: null, error: { message: 'Failed to fetch' } }) : undefined;
    fireEvent.press(screen.getByText('Save changes'));
    expect(await screen.findByText(/You're offline\. Your changes are still here/)).toBeTruthy();
  });

  it("doesn't offer to edit other campers' spots", async () => {
    signedIn(undefined, ALEX);
    await renderApp('/spot/sams-spot');
    expect(await screen.findByText('Added by Sam on Oct 7, 2026')).toBeTruthy();
    expect(screen.queryByText('Edit spot')).toBeNull();
    screen.unmount();

    await renderApp('/spot/edit/sams-spot');
    expect(await screen.findByText('You can only edit spots you added')).toBeTruthy();
  });

  it('asks before throwing away unsaved edits', async () => {
    signedIn();
    const alerts = spyOnAlerts();
    const app = await renderApp('/spot/sams-spot');
    fireEvent.press(await screen.findByText('Edit spot'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/edit/sams-spot'));
    fireEvent.changeText(field('Name, required'), 'Sam Flats');

    act(() => router.back());
    expect(alerts.lastTitle()).toBe('Discard your changes?');
    act(() => alerts.press('Keep editing'));
    expect(app.getPathname()).toBe('/spot/edit/sams-spot');
    expect(field('Name, required').props.value).toBe('Sam Flats');

    act(() => router.back());
    await act(async () => alerts.press('Discard'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/sams-spot'));
    expect(screen.getByText('Sam Flat')).toBeTruthy();
  });

  it('leaves without asking when nothing changed', async () => {
    signedIn();
    const alerts = spyOnAlerts();
    const app = await renderApp('/spot/sams-spot');
    fireEvent.press(await screen.findByText('Edit spot'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/edit/sams-spot'));
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe('/spot/sams-spot'));
    expect(alerts.alert).not.toHaveBeenCalled();
  });

  it('returns to the spot after saving, even when opened from a link', async () => {
    signedIn();
    const app = await renderApp('/spot/edit/sams-spot');
    fireEvent.changeText(await screen.findByLabelText('Name, required'), 'Sam Flats');
    fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/sams-spot'));
  });

  it('points out a nearby spot while editing, but not the spot itself', async () => {
    signedIn([makeRow({ id: 'row-spot', name: 'Row spot' }), SAMS_SPOT]);
    const app = await renderApp('/spot/edit/sams-spot');
    expect(await screen.findByLabelText('Name, required')).toBeTruthy();
    expect(screen.queryByText(/is .* away\. If it's the same place/)).toBeNull();
    fireEvent.changeText(field('GPS location, required'), '39.1901, -101.7601');
    fireEvent.press(await screen.findByText('Open it'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/row-spot'));
  });

  it('waits for the saved sign-in before deciding', async () => {
    const backend = fakeBackend([SAMS_SPOT]);
    // The saved sign-in never finishes loading.
    backend.auth.onAuthStateChange.mockImplementation(() => ({
      data: { subscription: { unsubscribe: () => true } },
    }));
    connectServer(backend);
    await renderApp('/spot/new');
    expect(screen.getByLabelText('Checking your sign-in')).toBeTruthy();
    screen.unmount();
    await renderApp('/account');
    expect(screen.getByLabelText('Checking your sign-in')).toBeTruthy();
  });

  it('waits for the spots to load before saying a spot to edit is gone', async () => {
    const backend = signedIn();
    let release: () => void = () => undefined;
    backend.intercept = (query) =>
      query.table === 'spots_api'
        ? new Promise<QueryResult>((resolve) => {
            release = () => {
              backend.intercept = null;
              void backend.run(query).then(resolve);
            };
          })
        : undefined;
    await renderApp('/spot/edit/sams-spot');
    expect(await screen.findByLabelText('Loading spot')).toBeTruthy();
    expect(screen.queryByText('Spot not found')).toBeNull();
    await act(async () => release());
    expect((await screen.findByLabelText('Name, required')).props.value).toBe('Sam Flat');
  });

  it('says when the spot to edit is gone', async () => {
    signedIn();
    await renderApp('/spot/edit/nope');
    expect(await screen.findByText('Spot not found')).toBeTruthy();
  });

  it('deletes a spot you added after asking', async () => {
    const alerts = spyOnAlerts();
    const backend = signedIn();
    const app = await renderApp('/spot/sams-spot');
    fireEvent.press(await screen.findByText('Delete spot'));
    expect(alerts.lastTitle()).toBe('Delete this spot?');
    alerts.press('Cancel');
    expect(backend.spots.has('sams-spot')).toBe(true);

    fireEvent.press(screen.getByText('Delete spot'));
    await act(async () => alerts.press('Delete'));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(backend.spots.has('sams-spot')).toBe(false);
    expect(screen.queryByTestId('marker-sams-spot')).toBeNull();
  });

  it("doesn't move a camper who left before a slow delete finished", async () => {
    const alerts = spyOnAlerts();
    const backend = signedIn();
    let land: () => void = () => undefined;
    const app = await renderApp('/account');
    act(() => router.push('/spot/sams-spot'));
    fireEvent.press(await screen.findByText('Delete spot'));
    backend.intercept = (query) => {
      if (query.op !== 'delete') return undefined;
      backend.intercept = null;
      return new Promise<QueryResult>((resolve) => (land = () => void backend.run(query).then(resolve)));
    };
    await act(async () => alerts.press('Delete'));
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe('/account'));
    await act(async () => land());
    expect(backend.spots.has('sams-spot')).toBe(false);
    expect(app.getPathname()).toBe('/account');
  });

  it("explains why a spot others have reported on can't be deleted", async () => {
    const alerts = spyOnAlerts();
    const backend = signedIn([{ ...SAMS_SPOT, report_count: 3 }]);
    await renderApp('/spot/sams-spot');
    fireEvent.press(await screen.findByText('Delete spot'));
    await act(async () => alerts.press('Delete'));
    await waitFor(() => expect(alerts.lastTitle()).toBe("Couldn't delete the spot"));
    expect(alerts.alert.mock.calls.at(-1)?.[1]).toMatch(/other campers have reported on it/);
    expect(backend.spots.has('sams-spot')).toBe(true);
    expect(screen.getByText('Delete spot')).toBeTruthy();
  });
});
