// The real starter list, end to end: every spot shows on the map and its
// page opens. Other screen tests pin the list to one spot (see
// test/mocks/seedSpots.ts); this one uses them all.

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { screen } from 'expo-router/testing-library';

import { SEED_SPOTS } from '@/data/seedSpots';

import { preset } from '../../test/fixtures';
import { renderApp } from '../../test/renderApp';

describe('Starter spots', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows every starter spot on the map', async () => {
    await renderApp('/');
    expect(screen.getByText(`${SEED_SPOTS.length} spots`)).toBeTruthy();
    for (const spot of SEED_SPOTS) expect(screen.getByTestId(`marker-${spot.id}`)).toBeTruthy();
  });

  it.each(SEED_SPOTS.map((s) => [s.id, s] as const))('opens the page for %s', async (id, spot) => {
    await renderApp(`/spot/${id}`);
    expect(screen.getByText(spot.name)).toBeTruthy();
    expect(screen.getByText(/Starter info from public listings/)).toBeTruthy();
    for (const source of spot.sources) expect(screen.getByText(source.label)).toBeTruthy();
  });

  it('shows the Fish and Game stay limit and the approximate Packwood pin', async () => {
    await renderApp('/spot/sublett-dam');
    expect(screen.getByText('10-day stay limit · No camper reports yet')).toBeTruthy();
    screen.unmount();

    await renderApp('/spot/forest-road-46-packwood');
    expect(screen.getByText('46.65300, -121.61400 (approximate)')).toBeTruthy();
  });

  it('tells a trailer Sublett Campground is too short', async () => {
    await renderApp('/spot/sublett-campground', { rig: preset('Truck + 25 ft trailer') });
    expect(screen.getByText("Won't fit your rig")).toBeTruthy();
    expect(screen.getByText(/Fits up to 20 ft; yours is 25 ft/)).toBeTruthy();
  });
});
