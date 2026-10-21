// A Valhalla /route answer (units: miles) from Goodland toward Smoky Gardens,
// shaped like the real thing: an encoded path with 6 decimal places and the
// maneuvers that follow it. The last two maneuvers are unpaved or rough.

export const ROUTE_FROM = { latitude: 39.3508, longitude: -101.7101 };
export const ROUTE_TO = { latitude: 39.19, longitude: -101.76 };

/** Encodes (39.3508,-101.7101) (39.3601,-101.7302) (39.4,-101.8) (39.41234,-101.81234) (39.42,-101.825). */
const SHAPE = '_`x`jAfp{~`EgdQfgf@w|lAnigCgbWfbWw}MfvW';

interface Overrides {
  shape?: string;
  maneuvers?: Record<string, unknown>[];
}

export function routeAnswer({ shape = SHAPE, maneuvers }: Overrides = {}) {
  return {
    trip: {
      status: 0,
      status_message: 'Found route between points',
      units: 'miles',
      summary: { length: 44, time: 3060 },
      legs: [
        {
          shape,
          maneuvers: maneuvers ?? [
            { length: 40.2, time: 2700, begin_shape_index: 0, end_shape_index: 2 },
            { length: 2.5, time: 240, rough: true, gate: true, begin_shape_index: 2, end_shape_index: 3 },
            { length: 1.3, time: 120, rough: true, begin_shape_index: 3, end_shape_index: 4 },
            { length: 0, time: 0, begin_shape_index: 4, end_shape_index: 4 },
          ],
        },
      ],
    },
  };
}
