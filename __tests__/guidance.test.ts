// Drive mode's arithmetic: where the camper is on the route, the next turn,
// and what DisCamp says when. The route is the fixture from Goodland:
//   p0 ─2.0 km─ p1 ─7.5 km─ p2 (turn left, rough, gate) ─1.7 km─ p3 (bear right, rough) ─1.4 km─ p4 (arrive)

import { describe, expect, it } from '@jest/globals';

import {
  announcementFor,
  guidanceAt,
  lowerFirst,
  M_PER_MI,
  positionOnRoute,
  shortDistance,
  spokenDistance,
  trackFor,
  type Guidance,
} from '@/lib/guidance';
import { parseRoute, type RoutePlan, type RouteStep } from '@/lib/routing';
import type { Coordinates } from '@/types';

import { routeAnswer } from '../test/routeFixture';

const plan = parseRoute(routeAnswer());
const track = trackFor(plan.path);
const p = (i: number): Coordinates => {
  const point = plan.path[i];
  if (!point) throw new Error(`No point ${i}`);
  return point;
};
const segmentLength = (i: number) => (track.cumulative[i + 1] ?? 0) - (track.cumulative[i] ?? 0);

/** A point on the segment from p(i) to p(i + 1), `meters` short of p(i + 1). */
function before(i: number, meters: number): Coordinates {
  const a = p(i);
  const b = p(i + 1);
  const t = 1 - meters / segmentLength(i);
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

/** Everything Drive mode would say at one spot, in order, starting fresh. */
function sayAll(g: Guidance, spoken = new Set<string>()): string[] {
  const said: string[] = [];
  for (
    let next = announcementFor(g, spoken, 'Smoky Gardens');
    next;
    next = announcementFor(g, spoken, 'Smoky Gardens')
  ) {
    spoken.add(next.key);
    said.push(next.text);
  }
  return said;
}

describe('the route track', () => {
  it('measures along the route', () => {
    expect(track.cumulative).toHaveLength(5);
    expect(track.cumulative[0]).toBe(0);
    expect(segmentLength(0)).toBeCloseTo(2014, -1);
    expect(track.total).toBeCloseTo(12_591, -1);
    expect(trackFor([])).toEqual({ cumulative: [0], total: 0 });
    expect(trackFor([p(0)]).total).toBe(0);
  });

  it('finds the nearest point on the route, and how far off it the camper is', () => {
    const onIt = positionOnRoute(plan.path, track, before(1, 1000));
    expect(onIt.segment).toBe(1);
    expect(onIt.along).toBeCloseTo((track.cumulative[2] ?? 0) - 1000, 0);
    expect(onIt.offRouteMeters).toBeLessThan(1);

    // About 1.1 km south of the start.
    const south = positionOnRoute(plan.path, track, { latitude: 39.3408, longitude: -101.7101 });
    expect(south.along).toBe(0);
    expect(south.offRouteMeters).toBeCloseTo(1113, -1);
  });

  it('stays on the right side of an out-and-back road', () => {
    const out = { latitude: 39.4, longitude: -101.8 };
    const end = { latitude: 39.41, longitude: -101.8 };
    const path = [out, end, out];
    const loop = trackFor(path);
    const middle = { latitude: 39.405, longitude: -101.8 };
    const half = loop.total / 4;
    expect(positionOnRoute(path, loop, middle).along).toBeCloseTo(half, 0);
    expect(positionOnRoute(path, loop, middle, half).along).toBeCloseTo(half, 0);
    // On the way back, the same spot is three quarters of the way along.
    expect(positionOnRoute(path, loop, middle, loop.total * 0.7).along).toBeCloseTo(half * 3, 0);
  });
});

describe('guidance on the way', () => {
  it('starts with the whole route ahead and the first turn next', () => {
    const g = guidanceAt(plan, track, p(0));
    expect(g).toMatchObject({ along: 0, stepIndex: 0, offRoute: false, arrived: false, onRough: false });
    expect(g.current?.instruction).toBe('Drive northwest on Main Avenue.');
    expect(g.next?.instruction).toBe('Turn left onto County Road 242.');
    expect(shortDistance(g.metersToNext)).toBe('5.9 mi');
    expect(g.remainingMeters).toBeCloseTo(track.total, 3);
    expect(g.remainingMinutes).toBe(51);
    expect(g.roughAheadMeters).toBeNull();
    expect(g.gateAheadMeters).toBeNull();
  });

  it('warns of unpaved road within half a mile, and a gate within 400 m', () => {
    const halfMile = guidanceAt(plan, track, before(1, 800));
    expect(halfMile.metersToNext).toBeCloseTo(800, 0);
    expect(halfMile.roughAheadMeters).toBeCloseTo(800, 0);
    expect(halfMile.gateAheadMeters).toBeNull();
    expect(halfMile.remainingMinutes).toBeCloseTo(51 * (halfMile.remainingMeters / track.total), 5);

    const close = guidanceAt(plan, track, before(1, 300));
    expect(close.gateAheadMeters).toBeCloseTo(300, 0);
  });

  it('knows when the camper is on rough road', () => {
    const g = guidanceAt(plan, track, before(2, segmentLength(2) / 2));
    expect(g.stepIndex).toBe(1);
    expect(g.onRough).toBe(true);
    expect(g.roughAheadMeters).toBeNull();
    expect(g.next?.instruction).toBe('Bear right onto Forest Road 46.');
  });

  it('arrives at the end of the route, or anywhere close to it', () => {
    expect(guidanceAt(plan, track, p(4))).toMatchObject({ arrived: true, remainingMeters: 0, remainingMinutes: 0 });
    expect(guidanceAt(plan, track, before(3, 30)).arrived).toBe(true);
    expect(guidanceAt(plan, track, before(3, 100)).arrived).toBe(false);
    // 30 m north of the end, past it.
    expect(guidanceAt(plan, track, { latitude: 39.42027, longitude: -101.825 }).arrived).toBe(true);
  });

  it('goes off route past 50 m, or farther when GPS is rough', () => {
    expect(guidanceAt(plan, track, { latitude: 39.3, longitude: -101.7 })).toMatchObject({
      offRoute: true,
      arrived: false,
    });
    // 60 m south of the start.
    const sixty = { latitude: 39.35026, longitude: -101.7101 };
    expect(guidanceAt(plan, track, sixty).offRoute).toBe(true);
    expect(guidanceAt(plan, track, sixty, { accuracy: 10 }).offRoute).toBe(true);
    expect(guidanceAt(plan, track, sixty, { accuracy: 50 }).offRoute).toBe(false);
  });

  it('copes with a route with no turns or no length', () => {
    const bare: RoutePlan = { ...plan, steps: [] };
    const g = guidanceAt(bare, track, before(1, 500));
    expect(g.next).toBeNull();
    expect(g.current).toBeNull();
    expect(g.metersToNext).toBeCloseTo(g.remainingMeters, 5);
    expect(announcementFor(g, new Set(), 'Smoky Gardens')).toBeNull();

    const nowhere: RoutePlan = { ...plan, path: [p(0)], steps: [] };
    const still = guidanceAt(nowhere, trackFor(nowhere.path), p(0));
    expect(still).toMatchObject({ remainingMeters: 0, remainingMinutes: 0, arrived: true });
  });
});

describe('what Drive mode says', () => {
  it('says the first step when it starts, then waits', () => {
    const spoken = new Set<string>();
    expect(sayAll(guidanceAt(plan, track, p(0)), spoken)).toEqual([
      'Drive northwest on Main Avenue. Continue for 40 miles.',
    ]);
    expect(sayAll(guidanceAt(plan, track, before(0, 500)), spoken)).toEqual([]);
  });

  it('calls the turn half a mile out, then the unpaved road', () => {
    const spoken = new Set(['start']);
    expect(sayAll(guidanceAt(plan, track, before(1, 800)), spoken)).toEqual([
      'In half a mile, turn left onto County Road 242.',
      'Unpaved road in half a mile.',
    ]);
    // Each is said once.
    expect(sayAll(guidanceAt(plan, track, before(1, 700)), spoken)).toEqual([]);
    expect(sayAll(guidanceAt(plan, track, before(1, 300)), spoken)).toEqual(['Mapped gate ahead.']);
    expect(sayAll(guidanceAt(plan, track, p(2)), spoken)).toEqual([
      'Turn left onto County Road 242. Then Bear right onto Forest Road 46.',
    ]);
  });

  it('puts the turn first when it is right there', () => {
    expect(sayAll(guidanceAt(plan, track, p(2)))).toEqual([
      'Turn left onto County Road 242. Then Bear right onto Forest Road 46.',
      'Mapped gate ahead.',
      'Unpaved road ahead.',
    ]);
  });

  it("says when the spot is coming up, and when they've arrived, once", () => {
    const spoken = new Set(['start']);
    expect(sayAll(guidanceAt(plan, track, before(3, 800)), spoken)).toEqual([
      "In half a mile, you'll reach Smoky Gardens.",
    ]);
    // No "You have arrived at your destination." from the server as well.
    expect(sayAll(guidanceAt(plan, track, before(3, 100)), spoken)).toEqual([]);
    expect(sayAll(guidanceAt(plan, track, p(4)), spoken)).toEqual(["You've arrived at Smoky Gardens."]);
    expect(sayAll(guidanceAt(plan, track, p(4)), spoken)).toEqual([]);
  });

  it('says nothing about turns while off route', () => {
    expect(sayAll(guidanceAt(plan, track, { latitude: 39.3, longitude: -101.7 }))).toEqual([]);
  });

  it('uses the written instruction when the server sent nothing to speak', () => {
    const plain = parseRoute(
      routeAnswer({
        maneuvers: [
          { type: 1, instruction: 'Drive north.', begin_shape_index: 0, end_shape_index: 2 },
          { type: 10, instruction: 'US 24 West.', begin_shape_index: 2, end_shape_index: 4 },
        ],
      }),
    );
    const plainTrack = trackFor(plain.path);
    expect(sayAll(guidanceAt(plain, plainTrack, before(1, 800)), new Set(['start']))).toEqual([
      'In half a mile, US 24 West.',
    ]);
    expect(sayAll(guidanceAt(plain, plainTrack, before(1, 50)), new Set(['start']))).toEqual(['US 24 West.']);
    expect(sayAll(guidanceAt(plain, plainTrack, p(0)))).toEqual(['Drive north.']);
  });
});

describe('what Drive mode says, on short back roads', () => {
  // Three short legs north: a turn 222 m in, then a gate 444 m in.
  const north = (m: number) => ({ latitude: 39 + m / 111_320, longitude: -101 });
  const step = (instruction: string, begin: number, extra: Partial<RouteStep> = {}): RouteStep => ({
    instruction,
    alert: null,
    pre: null,
    post: null,
    begin,
    end: begin + 1,
    miles: 0.14,
    minutes: 1,
    rough: false,
    gate: false,
    arrive: false,
    ...extra,
  });
  const short: RoutePlan = {
    ...plan,
    path: [north(0), north(222), north(444), north(666)],
    steps: [
      step('Drive north.', 0),
      step('Turn right onto Forest Road 12.', 1),
      step('Bear left onto Forest Road 12A.', 2, { gate: true }),
      step('You have arrived at your destination.', 3, { arrive: true }),
    ],
  };
  const shortTrack = trackFor(short.path);

  it('warns about a gate once, even with a turn before it', () => {
    const spoken = new Set(['start']);
    expect(sayAll(guidanceAt(short, shortTrack, north(100)), spoken)).toContain('Mapped gate ahead.');
    // Past the turn, the same gate is still ahead: not said again.
    expect(sayAll(guidanceAt(short, shortTrack, north(300)), spoken)).not.toContain('Mapped gate ahead.');
  });

  it('calls the turn earlier at highway speed', () => {
    const plain = parseRoute(
      routeAnswer({
        maneuvers: [
          { type: 1, instruction: 'Drive north.', begin_shape_index: 0, end_shape_index: 2 },
          { type: 10, instruction: 'US 24 West.', begin_shape_index: 2, end_shape_index: 4 },
        ],
      }),
    );
    const plainTrack = trackFor(plain.path);
    const at = before(1, 200);
    // 200 m out at a crawl: too early for "now", too late for "in a quarter mile".
    expect(sayAll(guidanceAt(plain, plainTrack, at, { speed: 5 }), new Set(['start']))).toEqual([]);
    // At 60 mph (27 m/s) that's 7 seconds away: say it now.
    const fast = guidanceAt(plain, plainTrack, at, { speed: 27 });
    expect(fast.preMeters).toBeCloseTo(216, 0);
    expect(sayAll(fast, new Set(['start']))).toEqual(['US 24 West.']);
  });

  it('puts the camper where they are along a straight road', () => {
    const position = positionOnRoute(short.path, shortTrack, north(105), 100);
    expect(position.along).toBeCloseTo(105, 0);
    expect(position.offRouteMeters).toBeLessThan(1);
  });
});

describe('distances', () => {
  it('speaks distances the way a person would', () => {
    expect(spokenDistance(10)).toBe('100 feet');
    expect(spokenDistance(150)).toBe('500 feet');
    expect(spokenDistance(0.25 * M_PER_MI)).toBe('a quarter mile');
    expect(spokenDistance(0.5 * M_PER_MI)).toBe('half a mile');
    expect(spokenDistance(0.75 * M_PER_MI)).toBe('three quarters of a mile');
    expect(spokenDistance(0.95 * M_PER_MI)).toBe('1 mile');
    expect(spokenDistance(2.6 * M_PER_MI)).toBe('3 miles');
  });

  it('writes them short for the screen', () => {
    expect(shortDistance(5)).toBe('50 ft');
    expect(shortDistance(100)).toBe('350 ft');
    expect(shortDistance(0.4 * M_PER_MI)).toBe('0.4 mi');
    expect(shortDistance(12.4 * M_PER_MI)).toBe('12 mi');
  });

  it('lowercases the start of a sentence, but not a road name', () => {
    expect(lowerFirst('Turn left onto Main Avenue.')).toBe('turn left onto Main Avenue.');
    expect(lowerFirst('US 24 West.')).toBe('US 24 West.');
    expect(lowerFirst('I-70 East.')).toBe('I-70 East.');
    expect(lowerFirst('')).toBe('');
  });
});
