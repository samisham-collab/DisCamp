// Drive mode's arithmetic: where the camper is along the route, the next
// turn, and what to say when. Pure functions with no React or GPS, so a
// background location task can reuse them later.

import type { Coordinates } from '../types';
import { distanceMeters } from './geo';
import type { RoutePlan, RouteStep } from './routing';

export const M_PER_MI = 1609.344;
const M_PER_FT = 0.3048;

/** Farther than this from the route (or 1.5× the GPS accuracy) counts as off route. */
const OFF_ROUTE_M = 50;
/** This close to the end counts as arrived. */
const ARRIVED_M = 40;
/** Say the next turn when it's this close... */
const ALERT_M = M_PER_MI;
/** ...but not if it's already this close (the "now" call covers it). */
const ALERT_MIN_M = 400;
/** Say "turn now" this close to the turn... */
const PRE_M = 120;
/** ...or this many seconds before it at speed (60 mph: about 215 m). */
const PRE_SECONDS = 8;
/** Warn this far ahead of unpaved roads... */
const ROUGH_WARN_M = M_PER_MI / 2;
/** ...and mapped gates. */
const GATE_WARN_M = 400;

/** Meters from the start of the route to each of its points. */
export interface RouteTrack {
  cumulative: number[];
  total: number;
}

export function trackFor(path: Coordinates[]): RouteTrack {
  const cumulative: number[] = [0];
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    cumulative.push((cumulative[i - 1] ?? 0) + (a && b ? distanceMeters(a, b) : 0));
  }
  return { cumulative, total: cumulative[cumulative.length - 1] ?? 0 };
}

export interface RoutePosition {
  /** Meters from the start of the route to the nearest point on it. */
  along: number;
  /** Meters from the camper to that point. */
  offRouteMeters: number;
  /** The route segment (between path[segment] and path[segment + 1]) the camper is on. */
  segment: number;
}

/**
 * The nearest point on the route. Where the route passes close to itself,
 * prefers the point nearest to `previousAlong`, so a loop or switchback
 * doesn't make the camper jump ahead or back.
 */
export function positionOnRoute(
  path: Coordinates[],
  track: RouteTrack,
  at: Coordinates,
  previousAlong: number | null = null,
): RoutePosition {
  // Flat-earth meters around the camper: plenty accurate within a few miles.
  const mPerLat = 111_320;
  const mPerLng = 111_320 * Math.cos((at.latitude * Math.PI) / 180);
  const xy = (p: Coordinates) => ({
    x: (p.longitude - at.longitude) * mPerLng,
    y: (p.latitude - at.latitude) * mPerLat,
  });

  // The nearest point on each segment.
  const candidates: RoutePosition[] = [];
  for (let i = 0; i + 1 < path.length; i += 1) {
    const pa = path[i];
    const pb = path[i + 1];
    if (!pa || !pb) continue;
    const a = xy(pa);
    const b = xy(pb);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / lengthSq));
    const start = track.cumulative[i] ?? 0;
    const end = track.cumulative[i + 1] ?? start;
    candidates.push({
      along: start + t * (end - start),
      offRouteMeters: Math.hypot(a.x + t * dx, a.y + t * dy),
      segment: i,
    });
  }
  let best: RoutePosition = { along: 0, offRouteMeters: Infinity, segment: 0 };
  for (const c of candidates) if (c.offRouteMeters < best.offRouteMeters) best = c;
  // Where the road passes close to itself, of the points within 15 m of the
  // nearest, the one nearest where the camper was.
  if (previousAlong != null) {
    for (const c of candidates) {
      if (
        c.offRouteMeters <= best.offRouteMeters + 15 &&
        Math.abs(c.along - previousAlong) < Math.abs(best.along - previousAlong)
      ) {
        best = c;
      }
    }
  }
  return best;
}

export interface Guidance {
  along: number;
  remainingMeters: number;
  remainingMinutes: number;
  /** The step the camper is driving now, and the turn coming up. */
  stepIndex: number;
  current: RouteStep | null;
  next: RouteStep | null;
  metersToNext: number;
  offRoute: boolean;
  arrived: boolean;
  onRough: boolean;
  /** Meters to the next unpaved or rough stretch, if one is within half a mile. */
  roughAheadMeters: number | null;
  /** Which step it starts at (so its warning is said once, however many turns come first). */
  roughAheadStep: number | null;
  /** Meters to a mapped gate, if one is within 400 m. */
  gateAheadMeters: number | null;
  gateAheadStep: number | null;
  /** How close to the turn "turn now" is said: farther at speed. */
  preMeters: number;
}

export function guidanceAt(
  plan: RoutePlan,
  track: RouteTrack,
  at: Coordinates,
  {
    accuracy = null,
    previousAlong = null,
    speed = null,
  }: { accuracy?: number | null; previousAlong?: number | null; speed?: number | null } = {},
): Guidance {
  const position = positionOnRoute(plan.path, track, at, previousAlong);
  const { along } = position;
  const steps = plan.steps;

  let stepIndex = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step && step.begin <= position.segment) stepIndex = i;
  }
  const next = steps[stepIndex + 1] ?? null;
  const at_ = (index: number) => track.cumulative[Math.min(index, track.cumulative.length - 1)] ?? track.total;
  const metersToNext = next ? Math.max(0, at_(next.begin) - along) : Math.max(0, track.total - along);

  const remainingMeters = Math.max(0, track.total - along);
  const remainingMinutes = track.total > 0 ? plan.minutes * (remainingMeters / track.total) : 0;
  const offRoute = position.offRouteMeters > Math.max(OFF_ROUTE_M, (accuracy ?? 0) * 1.5);
  const destination = plan.path[plan.path.length - 1];
  const arrived =
    (!offRoute && remainingMeters < ARRIVED_M) || (destination ? distanceMeters(at, destination) < ARRIVED_M : false);

  const current = steps[stepIndex] ?? null;
  const onRough = current?.rough === true;
  let roughAheadMeters: number | null = null;
  let roughAheadStep: number | null = null;
  let gateAheadMeters: number | null = null;
  let gateAheadStep: number | null = null;
  for (let i = stepIndex + 1; i < steps.length; i += 1) {
    const step = steps[i];
    if (!step) continue;
    const ahead = at_(step.begin) - along;
    if (roughAheadMeters == null && !onRough && step.rough && ahead <= ROUGH_WARN_M) {
      roughAheadMeters = ahead;
      roughAheadStep = i;
    }
    if (gateAheadMeters == null && step.gate && ahead <= GATE_WARN_M) {
      gateAheadMeters = ahead;
      gateAheadStep = i;
    }
    if (ahead > ROUGH_WARN_M) break;
  }
  const preMeters = Math.max(PRE_M, (speed != null && speed > 0 ? speed : 0) * PRE_SECONDS);

  return {
    along,
    remainingMeters,
    remainingMinutes,
    stepIndex,
    current,
    next,
    metersToNext,
    offRoute,
    arrived,
    onRough,
    roughAheadMeters,
    roughAheadStep,
    gateAheadMeters,
    gateAheadStep,
    preMeters,
  };
}

export interface Announcement {
  /** Each announcement is made once: Drive mode remembers the keys it has said. */
  key: string;
  text: string;
}

/** The next thing to say, if any: one at a time, most urgent first. */
export function announcementFor(
  g: Guidance,
  spoken: ReadonlySet<string>,
  destinationName: string,
): Announcement | null {
  const fresh = (a: Announcement) => (spoken.has(a.key) ? null : a);
  const nextIndex = g.stepIndex + 1;
  const next = g.next;
  const candidates: Announcement[] = [];

  if (g.arrived) return fresh({ key: 'arrived', text: `You've arrived at ${destinationName}.` });
  if (g.offRoute) return null;

  // Arriving is said once, at the end ("You've arrived at…"), not as a turn.
  if (next && !next.arrive && g.metersToNext <= g.preMeters) {
    candidates.push({ key: `pre:${nextIndex}`, text: next.pre ?? next.instruction });
  }
  // The first step ("Drive northwest on Main Avenue."), once, when Drive mode
  // starts at the beginning of the route, unless a turn is already due.
  if (spoken.size === 0 && g.stepIndex === 0 && g.current) {
    const first = [g.current.pre ?? g.current.instruction, g.current.post].filter(Boolean).join(' ');
    if (first) candidates.push({ key: 'start', text: first });
  }
  if (next && g.metersToNext <= ALERT_M && g.metersToNext > Math.max(ALERT_MIN_M, g.preMeters)) {
    const what = next.arrive ? `you'll reach ${destinationName}.` : lowerFirst(next.alert ?? next.instruction);
    candidates.push({ key: `alert:${nextIndex}`, text: `In ${spokenDistance(g.metersToNext)}, ${what}` });
  }
  if (g.gateAheadMeters != null) {
    candidates.push({ key: `gate:${g.gateAheadStep ?? nextIndex}`, text: 'Mapped gate ahead.' });
  }
  if (g.roughAheadMeters != null) {
    const where = g.roughAheadMeters <= g.preMeters ? 'ahead' : `in ${spokenDistance(g.roughAheadMeters)}`;
    candidates.push({ key: `rough:${g.roughAheadStep ?? nextIndex}`, text: `Unpaved road ${where}.` });
  }
  for (const c of candidates) {
    const said = fresh(c);
    if (said) return said;
  }
  return null;
}

/** For the voice: "500 feet", "half a mile", "3 miles". */
export function spokenDistance(meters: number): string {
  const miles = meters / M_PER_MI;
  if (miles < 0.15) return `${Math.max(100, Math.round(meters / M_PER_FT / 100) * 100)} feet`;
  if (miles < 0.35) return 'a quarter mile';
  if (miles < 0.65) return 'half a mile';
  if (miles < 0.9) return 'three quarters of a mile';
  const whole = Math.round(miles);
  return whole === 1 ? '1 mile' : `${whole} miles`;
}

/** For the screen: "450 ft", "0.4 mi", "12 mi". */
export function shortDistance(meters: number): string {
  const miles = meters / M_PER_MI;
  if (miles < 0.1) return `${Math.max(50, Math.round(meters / M_PER_FT / 50) * 50)} ft`;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

/** "Turn left…" becomes "turn left…"; "US 24…" stays as it is. */
export function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
