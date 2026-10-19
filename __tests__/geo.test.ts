import { describe, expect, it } from '@jest/globals';

import { DEFAULT_REGION } from '@/config';
import {
  bearingDegrees,
  compassPoint,
  distanceMeters,
  distanceMiles,
  formatCoordinates,
  formatDistance,
  formatDistanceSpoken,
  isValidCoordinate,
  nearestCoordinates,
  nearestWithin,
  regionForCoordinates,
} from '@/lib/geo';

describe('distanceMeters and nearestWithin', () => {
  const here = { latitude: 39.19, longitude: -101.76 };
  it('measures in meters: 0.0005 degrees of latitude is about 56 m', () => {
    expect(distanceMeters(here, { latitude: 39.1905, longitude: -101.76 })).toBeCloseTo(55.6, 0);
  });

  it('finds the closest within a distance, or none', () => {
    const near = { id: 'near', latitude: 39.191, longitude: -101.76 };
    const nearer = { id: 'nearer', latitude: 39.1901, longitude: -101.76 };
    const far = { id: 'far', latitude: 39.3, longitude: -101.76 };
    expect(nearestWithin([near, far, nearer], here, 2_000)?.id).toBe('nearer');
    expect(nearestWithin([far], here, 2_000)).toBeNull();
    expect(nearestWithin([], here, 2_000)).toBeNull();
  });
});

describe('nearestCoordinates', () => {
  it('lists the places nearest a point, nearest first, skipping bad ones', () => {
    const here = { latitude: 39.19, longitude: -101.76 };
    const a = { latitude: 39.2, longitude: -101.76 };
    const b = { latitude: 39.5, longitude: -101.76 };
    const c = { latitude: 44, longitude: -121 };
    const broken = { latitude: Number.NaN, longitude: 0 };
    expect(nearestCoordinates(here, [c, broken, b, a], 2)).toEqual([a, b]);
    expect(nearestCoordinates(here, [c], 3)).toEqual([c]);
    expect(nearestCoordinates(here, [a, b], 0)).toEqual([]);
  });
});

describe('distanceMiles', () => {
  it('is zero for the same point', () => {
    expect(distanceMiles({ latitude: 39, longitude: -101 }, { latitude: 39, longitude: -101 })).toBe(0);
  });

  it('matches one degree along the equator (about 69.1 miles)', () => {
    expect(distanceMiles({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(69.09, 1);
  });

  it('is symmetric', () => {
    const a = { latitude: 39.3508, longitude: -101.7101 };
    const b = { latitude: 39.19, longitude: -101.76 };
    expect(distanceMiles(a, b)).toBeCloseTo(distanceMiles(b, a), 10);
    // Goodland to Smoky Gardens, straight line: about 11.4 miles.
    expect(distanceMiles(a, b)).toBeGreaterThan(11);
    expect(distanceMiles(a, b)).toBeLessThan(12);
  });
});

describe('formatDistance', () => {
  it('formats short, medium and long distances', () => {
    expect(formatDistance(0.05)).toBe('Under 0.1 mi');
    expect(formatDistance(4.24)).toBe('4.2 mi');
    expect(formatDistance(37.6)).toBe('38 mi');
    expect(formatDistance(1204.2)).toBe('1,204 mi');
    // Rounded before choosing the format: never "10.0 mi".
    expect(formatDistance(9.96)).toBe('10 mi');
    expect(formatDistance(9.94)).toBe('9.9 mi');
    expect(formatDistanceSpoken(9.96)).toBe('10 miles');
  });

  it('returns nothing for nonsense input', () => {
    expect(formatDistance(Number.NaN)).toBe('');
    expect(formatDistance(-1)).toBe('');
  });
});

describe('coordinates', () => {
  it('formats to five decimals', () => {
    expect(formatCoordinates({ latitude: 39.19, longitude: -101.76 })).toBe('39.19000, -101.76000');
  });

  it('validates ranges', () => {
    expect(isValidCoordinate({ latitude: 39, longitude: -101 })).toBe(true);
    expect(isValidCoordinate({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidCoordinate({ latitude: 0, longitude: 181 })).toBe(false);
    expect(isValidCoordinate({ latitude: Number.NaN, longitude: 0 })).toBe(false);
  });
});

describe('regionForCoordinates', () => {
  it('falls back when there is nothing to show', () => {
    expect(regionForCoordinates([], DEFAULT_REGION)).toBe(DEFAULT_REGION);
    expect(regionForCoordinates([{ latitude: 200, longitude: 0 }], DEFAULT_REGION)).toBe(DEFAULT_REGION);
  });

  it('centers on a single spot', () => {
    expect(regionForCoordinates([{ latitude: 39.19, longitude: -101.76 }], DEFAULT_REGION)).toEqual({
      latitude: 39.19,
      longitude: -101.76,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    });
  });

  it('frames several spots with padding', () => {
    const region = regionForCoordinates(
      [
        { latitude: 39, longitude: -102 },
        { latitude: 40, longitude: -101 },
      ],
      DEFAULT_REGION,
    );
    expect(region.latitude).toBeCloseTo(39.5);
    expect(region.longitude).toBeCloseTo(-101.5);
    expect(region.latitudeDelta).toBeCloseTo(1.4);
    expect(region.longitudeDelta).toBeCloseTo(1.4);
  });

  it('never zooms in past the minimum when spots are close together', () => {
    const region = regionForCoordinates(
      [
        { latitude: 39, longitude: -101 },
        { latitude: 39.0001, longitude: -101.0001 },
      ],
      DEFAULT_REGION,
    );
    expect(region.latitudeDelta).toBe(0.05);
    expect(region.longitudeDelta).toBe(0.05);
  });
});

describe('direction', () => {
  const goodland = { latitude: 39.3508, longitude: -101.7101 };

  it('gives the compass bearing from one point to another', () => {
    expect(bearingDegrees(goodland, { latitude: 40.3508, longitude: -101.7101 })).toBeCloseTo(0, 5);
    expect(bearingDegrees(goodland, { latitude: 38.3508, longitude: -101.7101 })).toBeCloseTo(180, 5);
    expect(bearingDegrees({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(90, 5);
    expect(bearingDegrees({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: -1 })).toBeCloseTo(270, 5);
    // Smoky Gardens is a little west of due south of Goodland.
    expect(bearingDegrees(goodland, { latitude: 39.19, longitude: -101.76 })).toBeCloseTo(193.5, 0);
  });

  it('rounds to the nearest of 8 compass points', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(22.4)).toBe('N');
    expect(compassPoint(22.6)).toBe('NE');
    expect(compassPoint(193.5)).toBe('S');
    expect(compassPoint(315)).toBe('NW');
    expect(compassPoint(359.9)).toBe('N');
    expect(compassPoint(-45)).toBe('NW');
  });

  it('spells distances out for screen readers', () => {
    expect(formatDistanceSpoken(0.05)).toBe('under a tenth of a mile');
    expect(formatDistanceSpoken(1)).toBe('1 mile');
    expect(formatDistanceSpoken(3.98)).toBe('4 miles');
    expect(formatDistanceSpoken(4.24)).toBe('4.2 miles');
    expect(formatDistanceSpoken(1204.4)).toBe('1,204 miles');
    expect(formatDistanceSpoken(Number.NaN)).toBe('');
  });
});
