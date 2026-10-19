import { afterEach, describe, expect, it, jest } from '@jest/globals';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Linking, Share } from 'react-native';

import * as Location from 'expo-location';

import { preset } from '../../test/fixtures';
import { GOODLAND } from '../../test/mocks/expoLocation';
import { renderApp } from '../../test/renderApp';

const textOf = () => JSON.stringify(screen.toJSON());
/** Position of a whole text node in the rendered tree, for checking order. */
const positionOf = (text: string) => textOf().indexOf(JSON.stringify(text));

// Pinned to Smoky Gardens only: see test/mocks/seedSpots.ts.
jest.mock('@/data/seedSpots', () => jest.requireActual('../../test/mocks/seedSpots'));

describe('Spot screen', () => {
  // Expo Router's renderRouter turns on fake timers; leave them on so the
  // testing library can unmount the app cleanly after each test.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows Smoky Gardens for the default rig', async () => {
    await renderApp('/spot/smoky-gardens');
    expect(screen.getByText('Smoky Gardens')).toBeTruthy();
    expect(screen.getByText('Fits your rig')).toBeTruthy();
    expect(screen.getByText('Cost to stay')).toBeTruthy();
    expect(screen.getByText('For your rig: Free (standard site)')).toBeTruthy();
    expect(screen.getByText('Stay limit not reported · No check-ins yet')).toBeTruthy();
    expect(screen.getByText(/Starter info from public listings/)).toBeTruthy();
    expect(screen.getByLabelText('Cost meter: Free, $0 a night')).toBeTruthy();
    expect(screen.getByText('39.19000, -101.76000 (approximate)')).toBeTruthy();
    // Standard campers see Access before the cost card.
    expect(positionOf('Access')).toBeGreaterThan(-1);
    expect(positionOf('Access')).toBeLessThan(positionOf('Cost to stay'));
  });

  it('puts the big-rig cost meter first, priced on the RV fee', async () => {
    await renderApp('/spot/smoky-gardens', { rig: preset('40 ft Class A') });
    expect(screen.getByText('Big-rig cost meter')).toBeTruthy();
    expect(screen.getByText('For your rig: $20 a night (RV site)')).toBeTruthy();
    expect(screen.getByLabelText('Cost meter: Moderate, $15–30 a night')).toBeTruthy();
    expect(screen.getAllByText('$20 a night').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Not enough reports to tell')).toBeTruthy();
    expect(positionOf('Big-rig cost meter')).toBeGreaterThan(-1);
    expect(positionOf('Big-rig cost meter')).toBeLessThan(positionOf('Access'));
  });

  it('labels the trailer cost meter for trailers', async () => {
    await renderApp('/spot/smoky-gardens', { rig: preset('Truck + 25 ft trailer') });
    expect(screen.getByText('Trailer cost meter')).toBeTruthy();
  });

  it('goes back to Explore from a link straight to a spot', async () => {
    const app = await renderApp('/spot/smoky-gardens');
    expect(router.canGoBack()).toBe(true);
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(screen.getByText('DisCamp')).toBeTruthy();
  });

  it('handles a spot that does not exist', async () => {
    const app = await renderApp('/spot/no-such-spot');
    expect(screen.getByText('Spot not found')).toBeTruthy();
    fireEvent.press(screen.getByText('Back to the map'));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });

  it('opens directions, shares, copies and calls', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await renderApp('/spot/smoky-gardens');

    fireEvent.press(screen.getByText('Directions'));
    await waitFor(() => expect(open).toHaveBeenCalledWith(expect.stringContaining('39.19,-101.76')));

    fireEvent.press(screen.getByLabelText('Share'));
    await waitFor(() => expect(share).toHaveBeenCalled());

    fireEvent.press(screen.getByLabelText('Copy GPS'));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('39.19000, -101.76000'));
    expect(await screen.findByLabelText('Copied')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Call'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('tel:7858996334'));
  });

  it('shows distance when location was already allowed', async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValueOnce({
      status: 'granted',
      canAskAgain: true,
      granted: true,
    } as Awaited<ReturnType<typeof Location.getForegroundPermissionsAsync>>);
    jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValueOnce({
      coords: GOODLAND,
    } as Awaited<ReturnType<typeof Location.getLastKnownPositionAsync>>);
    await renderApp('/spot/smoky-gardens');
    expect(await screen.findByText('11 mi south of you, in a straight line')).toBeTruthy();
  });

  it('shows a page for unknown links', async () => {
    await renderApp('/no/such/page');
    expect(screen.getByText("This page doesn't exist")).toBeTruthy();
  });
});
