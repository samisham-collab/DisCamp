// Route previews: a driving route from the camper to a spot, worked out by a
// Valhalla routing server (EXPO_PUBLIC_ROUTING_URL) from OpenStreetMap roads,
// and tuned to the camper's rig. DisCamp draws the route on its own map;
// turn-by-turn directions still open in Apple Maps or Google Maps.
//
// The request carries only the two points and the rig's routing settings:
// no account, name or device id.

import { LEGAL_BASE_URL, ROUTE_TIMEOUT_MS, ROUTING_URL } from '../config';
import type { Coordinates } from '../types';
import { DeadlineError, withDeadline } from './deadline';
import { maxTierFor, type FitRig } from './fit';
import { decodePolyline } from './polyline';

const M_PER_FT = 0.3048;
/** A pickup's length, added to a trailer to get the whole rig. */
const TOW_VEHICLE_FT = 18;
/** Routes are kept this long, so reopening one doesn't ask the server again. */
const CACHE_MS = 15 * 60 * 1000;
/** Start points this close (about 100 m) count as the same place for the cache. */
const CACHE_DECIMALS = 3;

export interface RouteCosting {
  costing: 'auto' | 'truck';
  /** Valhalla costing options, in its units (meters, metric tons, 0 to 1). */
  options: Record<string, number | boolean>;
  /** What the route does for this rig, in plain words. */
  summary: string;
}

/** How to route for a rig: as a car (with its clearance and height) or, towing, as a long vehicle. */
export function costingFor(rig: FitRig): RouteCosting {
  if (rig.setup === 'trailer' || rig.setup === 'bigrig') {
    const bigRig = rig.setup === 'bigrig';
    const totalFt = bigRig ? rig.lengthFt : rig.lengthFt + TOW_VEHICLE_FT;
    return {
      costing: 'truck',
      options: {
        length: round1(totalFt * M_PER_FT),
        height: bigRig ? 3.8 : 3.4,
        width: 2.6,
        weight: bigRig ? 14 : 7,
        use_tracks: 0,
      },
      summary: `As a ${totalFt} ft rig: avoids roads mapped as too short, low or narrow for it, and rough tracks.`,
    };
  }

  const height = rig.setup === 'van' ? 2.8 : rig.setup === 'rtt' ? 2.5 : 1.9;
  const fourByFour = rig.drivetrain === '4wd' || rig.drivetrain === '4wd-lockers';
  const tier = maxTierFor(rig.clearanceIn);
  if (tier <= 2 && !fourByFour) {
    return {
      costing: 'auto',
      options: { exclude_unpaved: true, use_tracks: 0, height },
      summary: 'Low clearance: stays on paved roads until close to the spot.',
    };
  }
  if (fourByFour && tier >= 4) {
    return {
      costing: 'auto',
      options: { use_tracks: 0.5, height },
      summary: '4WD with high clearance: takes rough tracks when they save time.',
    };
  }
  return {
    costing: 'auto',
    options: { use_tracks: 0, height },
    summary: 'Prefers paved and gravel roads over rough tracks.',
  };
}

export interface RoutePlan {
  miles: number;
  minutes: number;
  /** The whole route, start to spot. */
  path: Coordinates[];
  /** Stretches the map data marks as unpaved or rough. */
  roughSegments: Coordinates[][];
  roughMiles: number;
  /** Gates mapped along the way. */
  gates: number;
  ferry: boolean;
  toll: boolean;
  /** Turn by turn, in order, for Drive mode. */
  steps: RouteStep[];
}

/** One maneuver: "Turn left onto County Road 242", and the stretch of road after it. */
export interface RouteStep {
  /** Shown on screen. */
  instruction: string;
  /** Spoken well before the turn ("Turn left onto County Road 242."), if the server sent one. */
  alert: string | null;
  /** Spoken just before the turn. */
  pre: string | null;
  /** Spoken just after it ("Continue for 3 miles."). */
  post: string | null;
  /** Where the maneuver starts and the stretch after it ends, as indexes into `path`. */
  begin: number;
  end: number;
  miles: number;
  minutes: number;
  rough: boolean;
  gate: boolean;
  /** The last step: "You have arrived at your destination." */
  arrive: boolean;
}

export type RouteErrorKind = 'off' | 'no-route' | 'timeout' | 'unavailable';

export class RouteError extends Error {
  readonly kind: RouteErrorKind;
  constructor(kind: RouteErrorKind) {
    super(`Route: ${kind}`);
    this.name = 'RouteError';
    this.kind = kind;
  }
}

/** What to tell the camper when a route couldn't be worked out. */
export const ROUTE_ERROR_MESSAGES: Record<RouteErrorKind, string> = {
  off: 'Route previews are turned off in this version of DisCamp.',
  'no-route':
    "No route found for your rig. The map may be missing a back road, or the roads it knows are too rough for your rig's settings.",
  timeout: 'The route service took too long to answer. Check your signal and try again.',
  unavailable: "The route service couldn't be reached. Check your signal and try again.",
};

interface Maneuver {
  type?: unknown;
  instruction?: unknown;
  verbal_transition_alert_instruction?: unknown;
  verbal_pre_transition_instruction?: unknown;
  verbal_post_transition_instruction?: unknown;
  time?: unknown;
  length?: unknown;
  rough?: unknown;
  gate?: unknown;
  ferry?: unknown;
  toll?: unknown;
  begin_shape_index?: unknown;
  end_shape_index?: unknown;
}

const isNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const text = (s: unknown): string | null => (typeof s === 'string' && s.trim() ? s.trim() : null);
/** Valhalla's maneuver types for arriving: straight ahead, on the right, on the left. */
const ARRIVE_TYPES: readonly unknown[] = [4, 5, 6];

/** Reads a Valhalla /route answer (units: miles). Throws RouteError('unavailable') if it isn't one. */
export function parseRoute(json: unknown): RoutePlan {
  const trip = (json as { trip?: { summary?: { length?: unknown; time?: unknown }; legs?: unknown } } | null)?.trip;
  const length = trip?.summary?.length;
  const time = trip?.summary?.time;
  if (!trip || !isNumber(length) || !isNumber(time) || !Array.isArray(trip.legs)) {
    throw new RouteError('unavailable');
  }

  const path: Coordinates[] = [];
  const roughSegments: Coordinates[][] = [];
  let roughMiles = 0;
  let gates = 0;
  let ferry = false;
  let toll = false;
  const steps: RouteStep[] = [];

  for (const leg of trip.legs as { shape?: unknown; maneuvers?: unknown }[]) {
    if (typeof leg?.shape !== 'string') throw new RouteError('unavailable');
    const points = decodePolyline(leg.shape, 6);
    const maneuvers = Array.isArray(leg.maneuvers) ? (leg.maneuvers as Maneuver[]) : [];
    // This leg's first point is the previous leg's last.
    const offset = path.length > 0 ? path.length - 1 : 0;
    for (const m of maneuvers) {
      if (isNumber(m.begin_shape_index) && isNumber(m.end_shape_index)) {
        steps.push({
          instruction: text(m.instruction) ?? '',
          alert: text(m.verbal_transition_alert_instruction),
          pre: text(m.verbal_pre_transition_instruction),
          post: text(m.verbal_post_transition_instruction),
          begin: offset + m.begin_shape_index,
          end: offset + m.end_shape_index,
          miles: isNumber(m.length) ? m.length : 0,
          minutes: isNumber(m.time) ? m.time / 60 : 0,
          rough: m.rough === true,
          gate: m.gate === true,
          arrive: ARRIVE_TYPES.includes(m.type),
        });
      }
      if (m.gate === true) gates += 1;
      if (m.ferry === true) ferry = true;
      if (m.toll === true) toll = true;
      if (m.rough !== true) continue;
      if (isNumber(m.length)) roughMiles += m.length;
      if (!isNumber(m.begin_shape_index) || !isNumber(m.end_shape_index)) continue;
      const stretch = points.slice(m.begin_shape_index, m.end_shape_index + 1);
      if (stretch.length < 2) continue;
      // Rough maneuvers in a row become one stretch on the map.
      const [first] = stretch;
      const last = roughSegments[roughSegments.length - 1];
      const end = last?.[last.length - 1];
      if (last && end && first && end.latitude === first.latitude && end.longitude === first.longitude) {
        last.push(...stretch.slice(1));
      } else {
        roughSegments.push(stretch);
      }
    }
    // Each leg starts where the last one ended.
    path.push(...(path.length > 0 ? points.slice(1) : points));
  }
  if (path.length < 2) throw new RouteError('unavailable');

  return {
    miles: length,
    minutes: time / 60,
    path,
    roughSegments,
    roughMiles,
    gates,
    ferry,
    toll,
    steps,
  };
}

const cache = new Map<string, { at: number; plan: RoutePlan }>();

/** For tests. */
export function clearRouteCache(): void {
  cache.clear();
}

/** The part of fetch() the router uses (tests pass their own). */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface FetchRouteOptions {
  url?: string | null;
  timeoutMs?: number;
  fetchFn?: FetchLike;
  /** Ask the server even if a recent route is saved (rerouting). */
  fresh?: boolean;
}

/** The route from `from` to `to` for this rig. Throws RouteError. */
export async function fetchRoute(
  from: Coordinates,
  to: Coordinates,
  rig: FitRig,
  { url = ROUTING_URL, timeoutMs = ROUTE_TIMEOUT_MS, fetchFn, fresh = false }: FetchRouteOptions = {},
): Promise<RoutePlan> {
  if (!url) throw new RouteError('off');
  const { costing, options } = costingFor(rig);
  const key = [
    url,
    costing,
    JSON.stringify(options),
    from.latitude.toFixed(CACHE_DECIMALS),
    from.longitude.toFixed(CACHE_DECIMALS),
    to.latitude,
    to.longitude,
  ].join('|');
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.plan;

  const body = {
    locations: [
      { lat: from.latitude, lon: from.longitude },
      { lat: to.latitude, lon: to.longitude },
    ],
    costing,
    costing_options: { [costing]: options },
    units: 'miles',
  };

  const doFetch: FetchLike = fetchFn ?? ((target, init) => globalThis.fetch(target, init));
  let plan: RoutePlan;
  try {
    plan = await withDeadline(async (signal) => {
      const response = await doFetch(`${url}/route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          // Public routing servers ask apps to say who they are.
          'User-Agent': `DisCamp (${LEGAL_BASE_URL})`,
        },
        body: JSON.stringify(body),
        signal,
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new RouteError(isNoRoute(json) ? 'no-route' : 'unavailable');
      return parseRoute(json);
    }, timeoutMs);
  } catch (error) {
    if (error instanceof RouteError) throw error;
    if (error instanceof DeadlineError) throw new RouteError('timeout');
    throw new RouteError('unavailable');
  }
  cache.set(key, { at: Date.now(), plan });
  return plan;
}

/** Valhalla's "no path" answers: 442 (no path), 171 (no road near a point), 154 (too far). */
function isNoRoute(json: unknown): boolean {
  const body = json as { error_code?: unknown; error?: unknown } | null;
  if (body?.error_code === 442 || body?.error_code === 171 || body?.error_code === 154) return true;
  return typeof body?.error === 'string' && /no path|no suitable edges|exceeds the max distance/i.test(body.error);
}

/** "45 min", "2 h 51 min", "6 h". */
export function formatDriveTime(minutes: number): string {
  const total = Math.max(1, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "142 mi · 2 h 51 min", or "0.8 mi" under 10 miles. */
export function routeSummary(plan: Pick<RoutePlan, 'miles' | 'minutes'>): string {
  const miles = plan.miles < 10 ? plan.miles.toFixed(1) : String(Math.round(plan.miles));
  return `${miles} mi · ${formatDriveTime(plan.minutes)}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
