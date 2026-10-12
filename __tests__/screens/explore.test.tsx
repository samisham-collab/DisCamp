import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import * as Location from 'expo-location';
import { AccessibilityInfo, BackHandler, RefreshControl } from 'react-native';

import { STORAGE_KEYS } from '@/config';
import { SEED_SPOTS } from '@/data/seedSpots';
import { kvStore } from '@/lib/kvStore';
import { getSupabase } from '@/lib/supabase';

import { fakeClient, type QueryResult } from '../../test/fakeSupabase';
import { makeRow, preset } from '../../test/fixtures';
import { GOODLAND } from '../../test/mocks/expoLocation';
import { holdMapReady, lastMap, mapMethods, markerMethods, releaseMapReady } from '../../test/mocks/reactNativeMaps';
import { renderApp } from '../../test/renderApp';

// Pinned to Smoky Gardens only: see test/mocks/seedSpots.ts.
jest.mock('@/data/seedSpots', () => jest.requireActual('../../test/mocks/seedSpots'));

describe('Explore screen', () => {
  // Expo Router's renderRouter turns on fake timers; leave them on so the
  // testing library can unmount the app cleanly after each test.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows Smoky Gardens and opens it from the map', async () => {
    const app = await renderApp('/');
    expect(screen.getByText('DisCamp')).toBeTruthy();
    expect(screen.getByText('1 spot')).toBeTruthy();

    fireEvent.press(screen.getByTestId('marker-smoky-gardens'));
    const card = await screen.findByTestId('spot-summary');
    expect(card).toBeTruthy();
    expect(screen.getByText('Fits your rig')).toBeTruthy();
    expect(screen.getByText('Cost for your rig: Free')).toBeTruthy();

    fireEvent.press(screen.getByText('View spot'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/smoky-gardens'));
  });

  it('closes the card on a map tap, but not on the tap that opened it', async () => {
    await renderApp('/');
    const map = screen.getByTestId('spot-map');
    fireEvent.press(screen.getByTestId('marker-smoky-gardens'));
    await screen.findByTestId('spot-summary');

    // iOS reports the marker tap to the map as well; Android may send a plain tap.
    fireEvent(map, 'touchEnd', { nativeEvent: { action: 'marker-press' } });
    fireEvent(map, 'touchEnd', { nativeEvent: {} });
    expect(screen.getByTestId('spot-summary')).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });
    fireEvent(map, 'touchEnd', { nativeEvent: {} });
    await waitFor(() => expect(screen.queryByTestId('spot-summary')).toBeNull());
  });

  it('fits the map around several spots', async () => {
    jest.mocked(getSupabase).mockReturnValueOnce(
      fakeClient(async () => ({
        data: [
          makeRow({ id: 'north', name: 'North', latitude: 40.1 }),
          makeRow({ id: 'south', name: 'South', latitude: 38.9 }),
        ],
        error: null,
      })),
    );
    await renderApp('/');
    await screen.findByTestId('marker-north');
    fireEvent.press(screen.getByLabelText('Show all spots'));
    expect(mapMethods.fitToCoordinates).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ latitude: 40.1 }),
        expect.objectContaining({ latitude: 38.9 }),
      ]),
      expect.objectContaining({ animated: true }),
    );
  });

  it('shows the area around spots at the same place, instead of zooming all the way in', async () => {
    jest.mocked(getSupabase).mockReturnValueOnce(
      fakeClient(async () => ({
        data: [
          makeRow({ id: 'one', name: 'One', latitude: 40.1, longitude: -105.2 }),
          makeRow({ id: 'two', name: 'Two', latitude: 40.1001, longitude: -105.2001 }),
        ],
        error: null,
      })),
    );
    await renderApp('/');
    await screen.findByTestId('marker-two');
    mapMethods.fitToCoordinates.mockClear();
    fireEvent.press(screen.getByLabelText('Show all spots'));
    expect(mapMethods.fitToCoordinates).not.toHaveBeenCalled();
    expect(mapMethods.animateToRegion).toHaveBeenLastCalledWith(
      expect.objectContaining({ latitudeDelta: 0.05, longitudeDelta: 0.05 }),
      400,
    );
  });

  it('comes back from the list to where the map was', async () => {
    await renderApp('/');
    const moved = { latitude: 44.1, longitude: -110.6, latitudeDelta: 1, longitudeDelta: 1 };
    fireEvent(screen.getByTestId('spot-map'), 'regionChangeComplete', moved);
    fireEvent.press(screen.getByRole('radio', { name: 'List' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Map' }));
    await screen.findByTestId('spot-map');
    expect(lastMap.initialRegion).toEqual(moved);
  });

  it('closes the summary card', async () => {
    await renderApp('/');
    fireEvent.press(screen.getByTestId('marker-smoky-gardens'));
    await screen.findByTestId('spot-summary');
    fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.queryByTestId('spot-summary')).toBeNull();
  });

  it('prices the cost meter for a big rig and explains unknown fit', async () => {
    await renderApp('/', { rig: preset('40 ft Class A') });
    fireEvent.press(screen.getByTestId('marker-smoky-gardens'));
    await screen.findByTestId('spot-summary');
    expect(screen.getByText('Not enough reports to tell')).toBeTruthy();
    expect(screen.getByText('Cost for your rig: $20 a night')).toBeTruthy();
  });

  it('filters, shows an empty state, and clears filters', async () => {
    await renderApp('/', { rig: preset('40 ft Class A') });
    fireEvent.press(screen.getByRole('checkbox', { name: 'Fits my rig' }));
    expect(await screen.findByText('No spots match these filters')).toBeTruthy();
    expect(screen.queryByTestId('marker-smoky-gardens')).toBeNull();

    fireEvent.press(screen.getByText('Clear filters'));
    expect(await screen.findByTestId('marker-smoky-gardens')).toBeTruthy();
  });

  it('remembers filters and view between launches', async () => {
    await renderApp('/');
    fireEvent.press(screen.getByRole('checkbox', { name: 'Free for my rig' }));
    fireEvent.press(screen.getByRole('radio', { name: 'List' }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });
    const saved = JSON.parse((await kvStore.getItem(STORAGE_KEYS.prefs)) ?? 'null') as unknown;
    expect(saved).toEqual({ filters: ['free'], mapType: 'standard', view: 'list' });
  });

  it('shows a sorted list and opens a spot from it', async () => {
    const app = await renderApp('/', { prefs: { view: 'list' } });
    expect(screen.getByText(/1 spot · best fit first/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('spot-item-smoky-gardens'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/smoky-gardens'));
  });

  it('sorts the list by distance once the camper is found', async () => {
    await renderApp('/', { prefs: { view: 'list' } });
    fireEvent.press(screen.getByRole('button', { name: 'Sort by distance' }));
    expect(await screen.findByText(/best fit and nearest first/)).toBeTruthy();
    expect(screen.queryByText('Sort by distance')).toBeNull();
    expect(screen.getByText(/11 mi S$/)).toBeTruthy();
  });

  it('lists every spot from the server and refreshes on pull', async () => {
    const respond = jest.fn(async () => ({
      data: [
        makeRow({ id: 'near-spot', name: 'Near Spot' }),
        makeRow({ id: 'far-spot', name: 'Far Spot', clearance_tier: 7 }),
      ],
      error: null,
    }));
    jest.mocked(getSupabase).mockReturnValueOnce(fakeClient(respond));
    await renderApp('/', { prefs: { view: 'list' } });
    expect(await screen.findByTestId('spot-item-near-spot')).toBeTruthy();
    expect(screen.getByTestId('spot-item-far-spot')).toBeTruthy();
    expect(screen.getByText(/2 spots · best fit first/)).toBeTruthy();
    // Best fit first: the 16"+ road sorts below the one that fits.
    const ids = screen.getAllByTestId(/^spot-item-/).map((item) => item.props.testID as string);
    expect(ids).toEqual(['spot-item-near-spot', 'spot-item-far-spot']);

    const refreshControl = screen.UNSAFE_getByType(RefreshControl);
    await act(async () => {
      (refreshControl.props as { onRefresh: () => void }).onRefresh();
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(respond).toHaveBeenCalledTimes(2);
  });

  it('opens My Rig from the rig chip', async () => {
    const app = await renderApp('/');
    fireEvent.press(screen.getByLabelText(/^Showing fit for/));
    await waitFor(() => expect(app.getPathname()).toBe('/rig'));
  });

  it('explains the colors', async () => {
    await renderApp('/');
    fireEvent.press(screen.getByLabelText('What the colors mean'));
    expect(await screen.findByText('Reading the map')).toBeTruthy();
    fireEvent.press(screen.getByText('Got it'));
    await waitFor(() => expect(screen.queryByText('Reading the map')).toBeNull());
  });

  it('switches to satellite and back', async () => {
    await renderApp('/');
    fireEvent.press(screen.getByLabelText('Show satellite map'));
    expect(await screen.findByLabelText('Show standard map')).toBeTruthy();
  });

  it('finds the camper, centers the map and shows distances', async () => {
    await renderApp('/');
    fireEvent.press(screen.getByLabelText('Show my location'));
    await waitFor(() => expect(mapMethods.animateToRegion).toHaveBeenCalled());
    fireEvent.press(screen.getByTestId('marker-smoky-gardens'));
    expect(await screen.findByText(/11 mi S$/)).toBeTruthy();
  });

  it('fits the map to all spots', async () => {
    await renderApp('/');
    fireEvent.press(screen.getByLabelText('Show all spots'));
    expect(mapMethods.animateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 39.19, longitude: -101.76 }),
      400,
    );
  });

  it('keeps working offline and recovers with Retry', async () => {
    let calls = 0;
    const client = fakeClient(async () => {
      calls += 1;
      return calls === 1
        ? { data: null, error: { message: 'TypeError: Network request failed' } }
        : { data: [makeRow({ id: 'fresh-spot', name: 'Fresh Spot' })], error: null };
    });
    jest.mocked(getSupabase).mockReturnValueOnce(client);

    await renderApp('/');
    expect(
      await screen.findByText("You're offline or the server can't be reached. Showing starter spots."),
    ).toBeTruthy();
    expect(screen.getByTestId('marker-smoky-gardens')).toBeTruthy();

    fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByTestId('marker-fresh-spot')).toBeTruthy();
    expect(screen.queryByText(/offline/)).toBeNull();
    // The fresh copy is saved for next time.
    await waitFor(async () => expect(await kvStore.getItem(STORAGE_KEYS.spotsCache)).toContain('fresh-spot'));
  });

  it('shows the saved copy when the server is down', async () => {
    jest
      .mocked(getSupabase)
      .mockReturnValueOnce(fakeClient(async () => ({ data: null, error: { message: 'Network request failed' } })));
    const savedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await kvStore.setItem(
      STORAGE_KEYS.spotsCache,
      JSON.stringify({ version: 1, savedAt, spots: [{ ...SEED_SPOTS[0], id: 'cached-spot', name: 'Cached Spot' }] }),
    );

    await renderApp('/');
    expect(await screen.findByText(/Showing spots saved 2 hr ago\./)).toBeTruthy();
    expect(screen.getByTestId('marker-cached-spot')).toBeTruthy();
  });
});

describe('Explore screen on a phone', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const layout = (height: number, y = 0) => ({ nativeEvent: { layout: { x: 0, y, width: 375, height } } });

  it('closes the card with the Android back button instead of leaving the app', async () => {
    type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
    const handlers: BackListener[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler);
      return { remove: () => void handlers.splice(handlers.indexOf(handler), 1) };
    });
    await renderApp('/');
    // The navigator keeps its own back handler; the card adds one on top.
    const before = handlers.length;
    fireEvent.press(screen.getByTestId('marker-smoky-gardens'));
    await screen.findByTestId('spot-summary');
    expect(handlers).toHaveLength(before + 1);

    let handled: ReturnType<BackListener> | undefined;
    act(() => {
      handled = handlers.at(-1)?.({} as Parameters<BackListener>[0]);
    });
    expect(handled).toBe(true);
    await waitFor(() => expect(screen.queryByTestId('spot-summary')).toBeNull());
    expect(handlers).toHaveLength(before);
  });

  it('centers the chosen pin above the card', async () => {
    await renderApp('/');
    fireEvent.press(screen.getByTestId('marker-smoky-gardens'));
    fireEvent(await screen.findByTestId('spot-summary'), 'layout', layout(240));
    // A short pause first, so Android applies the new map padding before moving.
    expect(mapMethods.animateCamera).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(200);
    });
    expect(mapMethods.animateCamera).toHaveBeenCalledWith(
      { center: { latitude: 39.19, longitude: -101.76 } },
      expect.objectContaining({ duration: expect.any(Number) }),
    );
  });

  it('hides the map buttons when the card would cover them, and brings them back', async () => {
    await renderApp('/');
    fireEvent(screen.getByTestId('map-area'), 'layout', layout(388));
    fireEvent(screen.getByTestId('map-controls'), 'layout', layout(164, 12));
    fireEvent.press(screen.getByTestId('marker-smoky-gardens'));

    // A short card leaves room for everything.
    fireEvent(await screen.findByTestId('spot-summary'), 'layout', layout(150));
    expect(screen.getByLabelText('Show my location')).toBeTruthy();

    // A tall card (small phone, large text) would cover the buttons.
    fireEvent(screen.getByTestId('spot-summary'), 'layout', layout(242));
    expect(screen.queryByLabelText('Show my location')).toBeNull();
    expect(screen.getByText('1 spot')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Close'));
    expect(await screen.findByLabelText('Show my location')).toBeTruthy();
  });

  it('frames the map around the spots once they first load', async () => {
    jest.mocked(getSupabase).mockReturnValueOnce(
      fakeClient(async () => ({
        data: [
          makeRow({ id: 'north', name: 'North', latitude: 40.1 }),
          makeRow({ id: 'south', name: 'South', latitude: 38.9 }),
        ],
        error: null,
      })),
    );
    await renderApp('/');
    await screen.findByTestId('marker-north');
    await waitFor(() => expect(mapMethods.fitToCoordinates).toHaveBeenCalledTimes(1));
  });

  it('waits for the map to load before framing it', async () => {
    holdMapReady();
    try {
      jest.mocked(getSupabase).mockReturnValueOnce(
        fakeClient(async () => ({
          data: [makeRow({ id: 'north', latitude: 40.1 }), makeRow({ id: 'south', latitude: 38.9 })],
          error: null,
        })),
      );
      await renderApp('/');
      await screen.findByTestId('marker-north');
      // Android ignores camera moves before the map is ready, so none is sent.
      expect(mapMethods.fitToCoordinates).not.toHaveBeenCalled();
      act(() => releaseMapReady());
      expect(mapMethods.fitToCoordinates).toHaveBeenCalledTimes(1);
    } finally {
      releaseMapReady();
    }
  });

  it("doesn't move a map the camper is already using", async () => {
    let finish: (rows: QueryResult) => void = () => undefined;
    jest.mocked(getSupabase).mockReturnValueOnce(fakeClient(() => new Promise((resolve) => (finish = resolve))));
    await renderApp('/');
    fireEvent(screen.getByTestId('map-area'), 'touchStart');
    await act(async () => {
      finish({
        data: [makeRow({ id: 'north', latitude: 40.1 }), makeRow({ id: 'south', latitude: 38.9 })],
        error: null,
      });
      await jest.advanceTimersByTimeAsync(0);
    });
    await screen.findByTestId('marker-north');
    expect(mapMethods.fitToCoordinates).not.toHaveBeenCalled();
    expect(mapMethods.animateToRegion).not.toHaveBeenCalled();
  });

  it('centers on the camper at launch when location was allowed before', async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValueOnce({
      status: 'granted',
      canAskAgain: true,
      granted: true,
    } as Awaited<ReturnType<typeof Location.getForegroundPermissionsAsync>>);
    jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValueOnce({
      coords: GOODLAND,
    } as Awaited<ReturnType<typeof Location.getLastKnownPositionAsync>>);
    await renderApp('/');
    await waitFor(() =>
      expect(mapMethods.animateToRegion).toHaveBeenCalledWith(expect.objectContaining(GOODLAND), expect.any(Number)),
    );
  });

  it('redraws a pin after its color changes (Android draws pins from snapshots)', async () => {
    await renderApp('/');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(600);
    });
    markerMethods.redraw.mockClear();
    fireEvent.press(screen.getByTestId('marker-smoky-gardens'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(600);
    });
    expect(markerMethods.redraw).toHaveBeenCalled();
  });

  it('reads out the new count when a filter changes', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    await renderApp('/', { rig: preset('40 ft Class A') });
    fireEvent.press(screen.getByRole('checkbox', { name: 'Fits my rig' }));
    expect(announce).toHaveBeenCalledWith('0 spots match your filters');
    fireEvent.press(screen.getByRole('checkbox', { name: 'Fits my rig' }));
    expect(announce).toHaveBeenLastCalledWith('1 spot');
  });

  it('reads out server problems once, not every time "saved N min ago" ticks over', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    jest
      .mocked(getSupabase)
      .mockReturnValueOnce(fakeClient(async () => ({ data: null, error: { message: 'Network request failed' } })));
    const savedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await kvStore.setItem(
      STORAGE_KEYS.spotsCache,
      JSON.stringify({ version: 1, savedAt, spots: [{ ...SEED_SPOTS[0], id: 'cached-spot', name: 'Cached Spot' }] }),
    );
    await renderApp('/');
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(
        "You're offline or the server can't be reached. Showing spots saved 5 min ago.",
      ),
    );
    // A minute later the banner says "6 min ago"; a re-render (a pin tap) must not read it out again.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(61_000);
    });
    fireEvent.press(screen.getByTestId('marker-cached-spot'));
    await screen.findByTestId('spot-summary');
    expect(screen.getByText(/saved 6 min ago/)).toBeTruthy();
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('drops a selection whose spot is no longer listed, so back still works', async () => {
    type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
    const handlers: BackListener[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler);
      return { remove: () => void handlers.splice(handlers.indexOf(handler), 1) };
    });
    const app = await renderApp('/', { prefs: { filters: ['fits'] } });
    const before = handlers.length;
    fireEvent.press(screen.getByTestId('marker-smoky-gardens'));
    await screen.findByTestId('spot-summary');
    expect(handlers).toHaveLength(before + 1);

    // On My Rig, switch to a rig that Smoky Gardens can't be checked for.
    act(() => router.navigate('/rig'));
    await waitFor(() => expect(app.getPathname()).toBe('/rig'));
    fireEvent.press(screen.getByRole('radio', { name: '40 ft Class A' }));
    act(() => router.navigate('/'));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(screen.queryByTestId('spot-summary')).toBeNull();
    expect(handlers).toHaveLength(before);

    // Switching back doesn't bring the old card back.
    act(() => router.navigate('/rig'));
    fireEvent.press(await screen.findByRole('radio', { name: 'Mid-size 4x4 + RTT' }));
    act(() => router.navigate('/'));
    await screen.findByTestId('marker-smoky-gardens');
    expect(screen.queryByTestId('spot-summary')).toBeNull();
  });

  it('flags roads that are impassable when wet, and says which way spots are', async () => {
    jest.mocked(getSupabase).mockReturnValueOnce(
      fakeClient(async () => ({
        data: [makeRow({ id: 'mud', name: 'Mud Flat', impassable_when_wet: true })],
        error: null,
      })),
    );
    await renderApp('/', { prefs: { view: 'list' } });
    expect(await screen.findByText('Impassable when wet')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Sort by distance' }));
    expect(await screen.findByText(/11 mi S$/)).toBeTruthy();
    expect(screen.getByLabelText(/Road is impassable when wet\..*11 miles south$/)).toBeTruthy();
  });
});
