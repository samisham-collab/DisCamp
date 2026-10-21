// Route previews: reading the routing server's answer, tuning the route to
// the rig, and what the camper hears when there's no route.

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { DEFAULT_ROUTING_URL, routingUrl } from '@/config';
import { decodePolyline } from '@/lib/polyline';
import {
  clearRouteCache,
  costingFor,
  fetchRoute,
  formatDriveTime,
  parseRoute,
  RouteError,
  routeSummary,
  type FetchLike,
} from '@/lib/routing';

import { preset } from '../test/fixtures';
import { ROUTE_FROM, ROUTE_TO, routeAnswer } from '../test/routeFixture';

const response = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

const URL = 'https://routing.test';

beforeEach(() => clearRouteCache());

function firstLeg() {
  const leg = routeAnswer().trip.legs[0];
  if (!leg) throw new Error('The fixture has no leg');
  return leg;
}

describe('decodePolyline', () => {
  it("reads Google's example at 5 decimal places", () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });

  it('reads 6 decimal places, as Valhalla sends them', () => {
    const points = decodePolyline(firstLeg().shape);
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual({ latitude: 39.3508, longitude: -101.7101 });
    expect(points[3]).toEqual({ latitude: 39.41234, longitude: -101.81234 });
  });

  it('keeps what it could read from a cut-off string', () => {
    expect(decodePolyline('_p~iF~ps|U_', 5)).toEqual([{ latitude: 38.5, longitude: -120.2 }]);
    expect(decodePolyline('', 6)).toEqual([]);
    expect(decodePolyline(' ', 6)).toEqual([]);
  });
});

describe('routing for the rig', () => {
  it('keeps low-clearance cars on pavement until near the spot', () => {
    expect(costingFor(preset('Sedan'))).toEqual({
      costing: 'auto',
      options: { exclude_unpaved: true, use_tracks: 0, height: 1.9 },
      summary: 'Low clearance: stays on paved roads until close to the spot.',
    });
  });

  it('lets a high-clearance 4WD take rough tracks, at rooftop-tent height', () => {
    const route = costingFor(preset('Mid-size 4x4 + RTT'));
    expect(route.costing).toBe('auto');
    expect(route.options).toEqual({ use_tracks: 0.5, height: 2.5 });
  });

  it('keeps a 2WD van off rough tracks, at van height', () => {
    expect(costingFor(preset('Camper van')).options).toEqual({ use_tracks: 0, height: 2.8 });
  });

  it('routes trailers and big rigs as long vehicles, truck and trailer together', () => {
    const trailer = costingFor(preset('Truck + 25 ft trailer'));
    expect(trailer.costing).toBe('truck');
    expect(trailer.options).toEqual({ length: 13.1, height: 3.4, width: 2.6, weight: 7, use_tracks: 0 });
    expect(trailer.summary).toMatch(/^As a 43 ft rig/);

    const bigRig = costingFor(preset('40 ft Class A'));
    expect(bigRig.options).toMatchObject({ length: 12.2, height: 3.8, weight: 14 });
  });
});

describe('reading a route', () => {
  it('gets the distance, time, path and unpaved stretches', () => {
    const plan = parseRoute(routeAnswer());
    expect(plan.miles).toBe(44);
    expect(plan.minutes).toBe(51);
    expect(plan.path).toHaveLength(5);
    // Two rough maneuvers in a row are one orange stretch.
    expect(plan.roughSegments).toHaveLength(1);
    expect(plan.roughSegments[0]).toHaveLength(3);
    expect(plan.roughMiles).toBeCloseTo(3.8);
    expect(plan.gates).toBe(1);
    expect(plan.ferry).toBe(false);
    expect(plan.toll).toBe(false);
  });

  it('joins legs without repeating the shared point', () => {
    const answer = routeAnswer();
    const leg = firstLeg();
    const twoLegs = { trip: { ...answer.trip, legs: [leg, { shape: leg.shape, maneuvers: [] }] } };
    expect(parseRoute(twoLegs).path).toHaveLength(9);
  });

  it('lists the turns for Drive mode, in order, with where each one starts', () => {
    const { steps } = parseRoute(routeAnswer());
    expect(steps.map((s) => [s.instruction, s.begin, s.end, s.rough, s.gate, s.arrive])).toEqual([
      ['Drive northwest on Main Avenue.', 0, 2, false, false, false],
      ['Turn left onto County Road 242.', 2, 3, true, true, false],
      ['Bear right onto Forest Road 46.', 3, 4, true, false, false],
      ['You have arrived at your destination.', 4, 4, false, false, true],
    ]);
    expect(steps[0]).toMatchObject({
      pre: 'Drive northwest on Main Avenue.',
      post: 'Continue for 40 miles.',
      alert: null,
    });
    expect(steps[1]).toMatchObject({ miles: 2.5, minutes: 4 });

    // A second leg's turns point into the joined path; a maneuver without a shape is skipped.
    const leg = firstLeg();
    const second = {
      shape: leg.shape,
      maneuvers: [{ instruction: ' Turn right. ', begin_shape_index: 1, end_shape_index: 4 }, {}],
    };
    const joined = parseRoute({ trip: { ...routeAnswer().trip, legs: [leg, second] } }).steps;
    expect(joined).toHaveLength(5);
    expect(joined[4]).toMatchObject({
      instruction: 'Turn right.',
      begin: 5,
      end: 8,
      alert: null,
      miles: 0,
      minutes: 0,
    });
  });

  it('notes ferries and tolls, and skips rough maneuvers without a shape', () => {
    const answer = routeAnswer({
      maneuvers: [
        { length: 1, ferry: true, toll: true, begin_shape_index: 0, end_shape_index: 1 },
        { length: 2, rough: true },
        { length: 0.5, rough: true, begin_shape_index: 4, end_shape_index: 4 },
      ],
    });
    const plan = parseRoute(answer);
    expect(plan.ferry).toBe(true);
    expect(plan.toll).toBe(true);
    expect(plan.roughMiles).toBe(2.5);
    expect(plan.roughSegments).toEqual([]);
  });

  it("refuses an answer that isn't a route", () => {
    for (const bad of [null, {}, { trip: {} }, { trip: { summary: { length: 1, time: 1 }, legs: [{}] } }]) {
      expect(() => parseRoute(bad)).toThrow(RouteError);
    }
    const onePoint = routeAnswer({ shape: '_p~iF~ps|U' });
    expect(() => parseRoute(onePoint)).toThrow(RouteError);
  });

  it('says how long the drive is', () => {
    expect(formatDriveTime(0.2)).toBe('1 min');
    expect(formatDriveTime(51)).toBe('51 min');
    expect(formatDriveTime(171)).toBe('2 h 51 min');
    expect(formatDriveTime(360)).toBe('6 h');
    expect(routeSummary({ miles: 44, minutes: 51 })).toBe('44 mi · 51 min');
    expect(routeSummary({ miles: 3.24, minutes: 9 })).toBe('3.2 mi · 9 min');
  });
});

describe('asking the routing server', () => {
  it('sends the two points and the rig settings, and nothing about the camper', async () => {
    const fetchFn = jest.fn<FetchLike>(async () => response(routeAnswer()));
    const plan = await fetchRoute(ROUTE_FROM, ROUTE_TO, preset('Sedan'), { url: URL, fetchFn });
    expect(plan.miles).toBe(44);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(`${URL}/route`);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['User-Agent']).toMatch(/^DisCamp \(/);
    expect(JSON.parse(String(init?.body))).toEqual({
      locations: [
        { lat: ROUTE_FROM.latitude, lon: ROUTE_FROM.longitude },
        { lat: ROUTE_TO.latitude, lon: ROUTE_TO.longitude },
      ],
      costing: 'auto',
      costing_options: { auto: { exclude_unpaved: true, use_tracks: 0, height: 1.9 } },
      units: 'miles',
    });
  });

  it('remembers a route for a while, per rig and start point', async () => {
    const fetchFn = jest.fn<FetchLike>(async () => response(routeAnswer()));
    await fetchRoute(ROUTE_FROM, ROUTE_TO, preset('Sedan'), { url: URL, fetchFn });
    // A few meters away: the same route.
    await fetchRoute({ latitude: 39.35081, longitude: -101.71012 }, ROUTE_TO, preset('Sedan'), { url: URL, fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await fetchRoute(ROUTE_FROM, ROUTE_TO, preset('40 ft Class A'), { url: URL, fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(2);

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60 * 1000);
    await fetchRoute(ROUTE_FROM, ROUTE_TO, preset('Sedan'), { url: URL, fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    jest.restoreAllMocks();

    // A reroute always asks again.
    await fetchRoute(ROUTE_FROM, ROUTE_TO, preset('Sedan'), { url: URL, fetchFn, fresh: true });
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("tells a missing route apart from a server that can't be reached", async () => {
    const kindFor = async (fetchFn: FetchLike) =>
      fetchRoute(ROUTE_FROM, ROUTE_TO, preset('Sedan'), { url: URL, fetchFn }).then(
        () => 'ok',
        (error: RouteError) => error.kind,
      );
    await expect(
      kindFor(async () => response({ error_code: 442, error: 'No path could be found' }, 400)),
    ).resolves.toBe('no-route');
    await expect(kindFor(async () => response({ error: 'No suitable edges near location' }, 400))).resolves.toBe(
      'no-route',
    );
    await expect(kindFor(async () => response({ error_code: 154 }, 400))).resolves.toBe('no-route');
    await expect(kindFor(async () => response({ error: 'Server error' }, 500))).resolves.toBe('unavailable');
    await expect(kindFor(async () => response('not json', 502))).resolves.toBe('unavailable');
    await expect(
      kindFor(async () => {
        throw new TypeError('Network request failed');
      }),
    ).resolves.toBe('unavailable');
    await expect(kindFor(async () => response({ nonsense: true }))).resolves.toBe('unavailable');
  });

  it('gives up when the server takes too long', async () => {
    const fetchFn = jest.fn<FetchLike>(() => new Promise<Response>(() => undefined));
    await expect(
      fetchRoute(ROUTE_FROM, ROUTE_TO, preset('Sedan'), { url: URL, fetchFn, timeoutMs: 5 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('does nothing when route previews are off', async () => {
    const fetchFn = jest.fn<FetchLike>();
    await expect(fetchRoute(ROUTE_FROM, ROUTE_TO, preset('Sedan'), { url: null, fetchFn })).rejects.toMatchObject({
      kind: 'off',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('the routing server setting', () => {
  it('defaults to the public Valhalla server, and can be changed or turned off', () => {
    expect(routingUrl(undefined)).toBe(DEFAULT_ROUTING_URL);
    expect(routingUrl('  ')).toBe(DEFAULT_ROUTING_URL);
    expect(routingUrl('off')).toBeNull();
    expect(routingUrl(' OFF ')).toBeNull();
    expect(routingUrl('https://valhalla.example.com/')).toBe('https://valhalla.example.com');
    expect(routingUrl('http://valhalla.example.com')).toBeNull();
    expect(routingUrl('valhalla.example.com')).toBeNull();
  });
});
