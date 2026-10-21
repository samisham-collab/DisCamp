// Route preview and Drive mode: from a spot's page to its route on DisCamp's
// map, then turn-by-turn guidance along it, spoken aloud, or the drive handed
// to the phone's maps app.

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from 'expo-router/testing-library';
import { useKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { Alert, Linking } from 'react-native';

import { ROUTE_ERROR_MESSAGES, clearRouteCache, type FetchLike } from '@/lib/routing';

import type { Coordinates } from '@/types';

import { activeWatches, emitFix, emitWatchError } from '../../test/mocks/expoLocation';
import { mapMethods } from '../../test/mocks/reactNativeMaps';
import { renderApp } from '../../test/renderApp';
import { ROUTE_FROM, routeAnswer } from '../../test/routeFixture';

// Pinned to Smoky Gardens only: see test/mocks/seedSpots.ts.
jest.mock('@/data/seedSpots', () => jest.requireActual('../../test/mocks/seedSpots'));

const answer = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

const realFetch = globalThis.fetch;
const fetchMock = jest.fn<FetchLike>();

beforeEach(() => {
  clearRouteCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => answer(routeAnswer()));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('Route preview', () => {
  it('opens from a spot and draws the route for the rig', async () => {
    await renderApp('/spot/smoky-gardens');
    fireEvent.press(screen.getByLabelText('Route'));

    expect(await screen.findByText('44 mi · 51 min')).toBeTruthy();
    expect(screen.getByText('Smoky Gardens')).toBeTruthy();
    expect(screen.getByText('About 3.8 mi unpaved or rough (orange on the map)')).toBeTruthy();
    expect(screen.getByText('The route passes a mapped gate. Gates on back roads can be locked.')).toBeTruthy();
    expect(screen.getByText(/^Routed for .+\. 4WD with high clearance/)).toBeTruthy();
    expect(screen.getByText('Route by Valhalla · Road data © OpenStreetMap contributors')).toBeTruthy();

    // Drawn on the map: the route, its rough stretch and the spot, framed to fit.
    expect(screen.getByTestId('route-line').props.accessibilityHint).toBe('5 points');
    expect(screen.getAllByTestId('route-rough')).toHaveLength(1);
    expect(screen.getByTestId('route-destination')).toBeTruthy();
    expect(mapMethods.fitToCoordinates).toHaveBeenCalledWith(
      expect.arrayContaining([{ latitude: 39.3508, longitude: -101.7101 }]),
      expect.objectContaining({ animated: true }),
    );

    // One request, to the routing server, from where the camper is.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://valhalla1.openstreetmap.de/route');
    expect(JSON.parse(String(init?.body)).locations[0]).toEqual({ lat: 39.3508, lon: -101.7101 });
  });

  it('hands the drive to the maps app', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await renderApp('/route/smoky-gardens');
    fireEvent.press(await screen.findByText('Open in Apple Maps'));
    expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/maps\.apple\.com\/\?daddr=39\.19,-101\.76/));
  });

  it('switches between the standard and satellite map', async () => {
    await renderApp('/route/smoky-gardens');
    await screen.findByText('44 mi · 51 min');
    fireEvent.press(screen.getByLabelText('Show satellite map'));
    expect(screen.getByLabelText('Show standard map')).toBeTruthy();
  });

  it('says when there is no route for the rig, and tries again', async () => {
    fetchMock.mockImplementationOnce(async () =>
      answer({ error_code: 442, error: 'No path could be found for input', status_code: 400 }, 400),
    );
    await renderApp('/route/smoky-gardens');
    expect(await screen.findByText(ROUTE_ERROR_MESSAGES['no-route'])).toBeTruthy();
    expect(screen.getByText('Directions in Apple Maps')).toBeTruthy();

    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('44 mi · 51 min')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('offers the maps app when location is off', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValueOnce({
      status: 'denied',
      canAskAgain: false,
      granted: false,
    } as never);
    await renderApp('/route/smoky-gardens');
    expect(await screen.findByText('DisCamp needs your location to work out a route.')).toBeTruthy();
    expect(screen.getByText('Directions in Apple Maps')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so when the spot is gone', async () => {
    await renderApp('/route/no-such-spot');
    expect(await screen.findByText('Spot not found')).toBeTruthy();
  });
});

// Along the fixture route (see test/routeFixture.ts).
const HALF_MILE_OUT = { latitude: 39.395722, longitude: -101.792516 }; // 800 m before the left turn
const LEFT_TURN = { latitude: 39.4, longitude: -101.8 };
const FOREST_ROAD = { latitude: 39.40617, longitude: -101.80617 }; // on County Road 242, before Forest Road 46
const LAST_STRETCH = { latitude: 39.41617, longitude: -101.81867 };
const END = { latitude: 39.42, longitude: -101.825 };
const WRONG_WAY = { latitude: 39.3, longitude: -101.7 };

const said = () => jest.mocked(Speech.speak).mock.calls.map(([text]) => text);
const fix = (at: Coordinates) => act(() => emitFix(at));

async function startDriving() {
  await renderApp('/route/smoky-gardens');
  fireEvent.press(await screen.findByText('Start'));
  expect(await screen.findByText('Waiting for GPS…')).toBeTruthy();
}

describe('Drive mode', () => {
  it('guides turn by turn, out loud, with the screen kept on', async () => {
    await startDriving();
    expect(useKeepAwake).toHaveBeenCalledWith('discamp-drive');
    expect(activeWatches()).toBe(1);
    expect(Location.watchPositionAsync).toHaveBeenCalledWith(
      expect.objectContaining({ accuracy: Location.Accuracy.BestForNavigation }),
      expect.any(Function),
      expect.any(Function),
    );

    fix(ROUTE_FROM);
    expect(screen.getByText('5.9 mi')).toBeTruthy();
    expect(screen.getByText('Turn left onto County Road 242.')).toBeTruthy();
    expect(screen.getByText('7.8 mi · 51 min left')).toBeTruthy();
    expect(said()).toEqual(['Drive northwest on Main Avenue. Continue for 40 miles.']);
    // The camera rides along, facing the way the camper drives.
    expect(mapMethods.animateCamera).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: ROUTE_FROM, heading: 90, pitch: 40 }),
      { duration: 800 },
    );

    fix(HALF_MILE_OUT);
    expect(screen.getByText('0.5 mi')).toBeTruthy();
    expect(screen.getByText('Unpaved road in 0.5 mi')).toBeTruthy();
    fix(HALF_MILE_OUT);
    expect(said().slice(1)).toEqual([
      'In half a mile, turn left onto County Road 242.',
      'Unpaved road in half a mile.',
    ]);

    fix(LEFT_TURN);
    expect(said().at(-1)).toBe('Turn left onto County Road 242. Then Bear right onto Forest Road 46.');
    expect(screen.getByText('Mapped gate in 50 ft')).toBeTruthy();

    fix(FOREST_ROAD);
    expect(screen.getByText('Bear right onto Forest Road 46.')).toBeTruthy();
    expect(screen.getByText('On unpaved or rough road')).toBeTruthy();

    fix(LAST_STRETCH);
    expect(screen.getByText('Continue to Smoky Gardens')).toBeTruthy();

    fix(END);
    expect(screen.getByText("You've arrived")).toBeTruthy();
    expect(said().at(-1)).toBe("You've arrived at Smoky Gardens.");
    // Driving on past the end of the road to the campsite isn't "off route".
    fix({ latitude: 39.421, longitude: -101.826 });
    expect(screen.getByText("You've arrived")).toBeTruthy();
    expect(said()).not.toContain('Off route.');

    fireEvent.press(screen.getByText('Done'));
    expect(activeWatches()).toBe(0);
    expect(Speech.stop).toHaveBeenCalled();
    expect(screen.getByText('44 mi · 51 min')).toBeTruthy();
  });

  it('can be muted, and ends when asked', async () => {
    await startDriving();
    fireEvent.press(screen.getByLabelText('Mute voice'));
    expect(Speech.stop).toHaveBeenCalled();
    fix(ROUTE_FROM);
    expect(Speech.speak).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Turn voice on'));
    fix(HALF_MILE_OUT);
    expect(said()).toEqual(['In half a mile, turn left onto County Road 242.']);

    fireEvent.press(screen.getByText('End'));
    expect(activeWatches()).toBe(0);
    expect(screen.getByText('Start')).toBeTruthy();

    // Starting again starts the directions over.
    jest.mocked(Speech.speak).mockClear();
    fireEvent.press(screen.getByText('Start'));
    fix(ROUTE_FROM);
    expect(said()).toEqual(['Drive northwest on Main Avenue. Continue for 40 miles.']);
  });

  it('lets the camper look around the map, then re-center', async () => {
    await startDriving();
    fix(ROUTE_FROM);
    fireEvent(screen.getByTestId('route-map'), 'panDrag');
    mapMethods.animateCamera.mockClear();
    fix(HALF_MILE_OUT);
    expect(mapMethods.animateCamera).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Re-center'));
    expect(mapMethods.animateCamera).toHaveBeenCalledWith(
      expect.objectContaining({ center: HALF_MILE_OUT }),
      expect.anything(),
    );
    expect(screen.queryByLabelText('Re-center')).toBeNull();
  });

  it('notices a wrong turn and works out a new route from there', async () => {
    await startDriving();
    fix(ROUTE_FROM);
    fix(WRONG_WAY);
    expect(screen.getByText('Off route')).toBeTruthy();
    expect(said().at(-1)).toBe('Off route.');
    fix({ latitude: 39.3001, longitude: -101.7 });
    expect(said().filter((text) => text === 'Off route.')).toHaveLength(1);

    // No route from out here: say so, and keep the old one.
    fetchMock.mockImplementationOnce(async () =>
      answer({ error_code: 442, error: 'No path could be found for input', status_code: 400 }, 400),
    );
    fireEvent.press(screen.getByText('Reroute'));
    expect(await screen.findByText(ROUTE_ERROR_MESSAGES['no-route'])).toBeTruthy();

    fireEvent.press(screen.getByText('Reroute'));
    expect(await screen.findByText('Waiting for GPS…')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, init] = fetchMock.mock.calls[2] ?? [];
    expect(JSON.parse(String(init?.body)).locations[0]).toEqual({ lat: 39.3001, lon: -101.7 });

    // The new route starts its directions over.
    expect(activeWatches()).toBe(1);
    fix(ROUTE_FROM);
    expect(screen.getByText('5.9 mi')).toBeTruthy();
    expect(said().at(-1)).toBe('Drive northwest on Main Avenue. Continue for 40 miles.');
  });

  it('keeps guiding if the voice fails, and stops cleanly if ended straight away', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.mocked(Speech.speak).mockImplementationOnce(() => {
      throw new Error('No voice');
    });
    jest.mocked(Speech.stop).mockRejectedValueOnce(new Error('Nothing to stop'));
    jest.mocked(Speech.stop).mockRejectedValueOnce(new Error('Nothing to stop'));
    await startDriving();
    fix(ROUTE_FROM);
    expect(screen.getByText('5.9 mi')).toBeTruthy();
    expect(warn.mock.calls.flat().join(' ')).toMatch(/Could not speak a direction/);
    fireEvent.press(screen.getByLabelText('Mute voice'));
    fireEvent.press(screen.getByText('End'));
    await act(async () => undefined);

    // Start and end before GPS is even set up: nothing keeps running.
    fireEvent.press(screen.getByText('Start'));
    fireEvent.press(screen.getByText('End'));
    await act(async () => undefined);
    expect(activeWatches()).toBe(0);
  });

  it('says when GPS drops out, and clears it when GPS is back', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await startDriving();
    act(() => emitWatchError('timeout'));
    expect(screen.getByText('DisCamp lost your location. Guidance resumes when GPS comes back.')).toBeTruthy();
    fix(ROUTE_FROM);
    expect(screen.queryByText(/lost your location/)).toBeNull();
  });

  it("says when it can't follow the camper's location at all", async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.mocked(Location.watchPositionAsync).mockRejectedValueOnce(new Error('Location is off'));
    await startDriving();
    expect(
      await screen.findByText("DisCamp couldn't follow your location. Check that location is on for DisCamp."),
    ).toBeTruthy();
  });
});
