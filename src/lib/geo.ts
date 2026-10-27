// Distance and map-region math. Pure functions, no React.

import type { Coordinates } from '../types';

export interface Region extends Coordinates {
  latitudeDelta: number;
  longitudeDelta: number;
}

const EARTH_RADIUS_MI = 3958.7613;
const toRadians = (deg: number) => (deg * Math.PI) / 180;

export function isValidCoordinate(c: Coordinates): boolean {
  return (
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitude) &&
    Math.abs(c.latitude) <= 90 &&
    Math.abs(c.longitude) <= 180
  );
}

/** Straight-line ("as the crow flies") distance in miles, haversine formula. */
export function distanceMiles(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

const METERS_PER_MILE = 1609.344;

/** Straight-line distance in meters. */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  return distanceMiles(a, b) * METERS_PER_MILE;
}

/** The closest of `items` to `at`, if one is within `maxMeters`. */
export function nearestWithin<T extends Coordinates>(
  items: readonly T[],
  at: Coordinates,
  maxMeters: number,
): T | null {
  let best: T | null = null;
  let bestMeters = maxMeters;
  for (const item of items) {
    const meters = distanceMeters(item, at);
    if (meters <= bestMeters) {
      best = item;
      bestMeters = meters;
    }
  }
  return best;
}

export type CompassPoint = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

const COMPASS_POINTS: readonly CompassPoint[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export const COMPASS_WORDS: Record<CompassPoint, string> = {
  N: 'north',
  NE: 'northeast',
  E: 'east',
  SE: 'southeast',
  S: 'south',
  SW: 'southwest',
  W: 'west',
  NW: 'northwest',
};

/** Initial compass bearing from `a` to `b`, 0–360 degrees (0 = north). */
export function bearingDegrees(a: Coordinates, b: Coordinates): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** The nearest of 8 compass points, e.g. 200° → "S". */
export function compassPoint(bearing: number): CompassPoint {
  const index = ((Math.round(bearing / 45) % 8) + 8) % 8;
  return COMPASS_POINTS[index] ?? 'N';
}

const withCommas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** "Under 0.1 mi", "4.2 mi", "37 mi", "1,204 mi". */
export function formatDistance(miles: number): string {
  if (!Number.isFinite(miles) || miles < 0) return '';
  if (miles < 0.1) return 'Under 0.1 mi';
  // Rounded first, so 9.96 reads "10 mi", not "10.0 mi".
  const tenths = Math.round(miles * 10) / 10;
  if (tenths < 10) return `${tenths.toFixed(1)} mi`;
  return `${withCommas(Math.round(miles))} mi`;
}

/** "4.2 miles", "under a tenth of a mile": for screen readers, which read "mi" oddly. */
export function formatDistanceSpoken(miles: number): string {
  if (!Number.isFinite(miles) || miles < 0) return '';
  if (miles < 0.1) return 'under a tenth of a mile';
  // One decimal under 10 miles, without a spoken ".0": "1 mile", "4.2 miles".
  const tenths = Math.round(miles * 10) / 10;
  const amount = tenths < 10 ? String(tenths) : withCommas(Math.round(miles));
  return `${amount} ${amount === '1' ? 'mile' : 'miles'}`;
}

/** "39.19000, -101.76000": what GPS units and map apps accept. */
export function formatCoordinates(c: Coordinates): string {
  return `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`;
}

const SINGLE_POINT_DELTA = 0.25;
/** The closest the map zooms when framing spots (about 3 miles across). */
export const MIN_DELTA = 0.05;
const PADDING_FACTOR = 1.4;

/**
 * A map region that shows every coordinate with some breathing room.
 * Returns `fallback` when there is nothing valid to show.
 */
/** The `count` places nearest to `at`, nearest first. */
export function nearestCoordinates(at: Coordinates, places: readonly Coordinates[], count: number): Coordinates[] {
  return places
    .filter(isValidCoordinate)
    .map((p) => ({ p: { latitude: p.latitude, longitude: p.longitude }, d: distanceMeters(at, p) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.max(0, count))
    .map((x) => x.p);
}

export function regionForCoordinates(coords: Coordinates[], fallback: Region): Region {
  const valid = coords.filter(isValidCoordinate);
  const first = valid[0];
  if (!first) return fallback;
  if (valid.length === 1) {
    return {
      latitude: first.latitude,
      longitude: first.longitude,
      latitudeDelta: SINGLE_POINT_DELTA,
      longitudeDelta: SINGLE_POINT_DELTA,
    };
  }
  let minLat = first.latitude;
  let maxLat = first.latitude;
  for (const c of valid) {
    minLat = Math.min(minLat, c.latitude);
    maxLat = Math.max(maxLat, c.latitude);
  }
  const { center, span } = longitudeArc(valid.map((c) => c.longitude));
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: center,
    latitudeDelta: Math.min(180, Math.max(MIN_DELTA, (maxLat - minLat) * PADDING_FACTOR)),
    longitudeDelta: Math.min(360, Math.max(MIN_DELTA, span * PADDING_FACTOR)),
  };
}

/**
 * The shortest stretch of longitude holding every point, so spots on both
 * sides of the 180th meridian (the far Aleutians) frame a few degrees, not
 * the whole world.
 */
export function longitudeArc(longitudes: number[]): { center: number; span: number } {
  const sorted = [...longitudes].sort((a, b) => a - b);
  const lowest = sorted[0] ?? 0;
  const highest = sorted[sorted.length - 1] ?? 0;
  // The widest empty stretch is what's left off; the arc starts after it.
  let gap = lowest + 360 - highest;
  let start = lowest;
  for (let i = 1; i < sorted.length; i += 1) {
    const here = sorted[i] ?? 0;
    const before = sorted[i - 1] ?? 0;
    if (here - before > gap) {
      gap = here - before;
      start = here;
    }
  }
  const span = 360 - gap;
  const center = start + span / 2;
  return { center: center > 180 ? center - 360 : center, span };
}
