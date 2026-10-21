// Route preview: from a spot's page to its route on DisCamp's map, with the
// drive handed to the phone's maps app.

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from 'expo-router/testing-library';
import * as Location from 'expo-location';
import { Alert, Linking } from 'react-native';

import { ROUTE_ERROR_MESSAGES, clearRouteCache, type FetchLike } from '@/lib/routing';

import { mapMethods } from '../../test/mocks/reactNativeMaps';
import { renderApp } from '../../test/renderApp';
import { routeAnswer } from '../../test/routeFixture';

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
    fireEvent.press(await screen.findByText('Start in Apple Maps'));
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
