// Encoded polylines: the compact text form routing servers use for a route's
// path (Google's algorithm; Valhalla uses 6 decimal places).

import type { Coordinates } from '../types';

/** Turns an encoded polyline into points. `precision` is the number of decimal places. */
export function decodePolyline(encoded: string, precision = 6): Coordinates[] {
  const factor = 10 ** precision;
  const points: Coordinates[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && shift < 35);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    const dLat = next();
    const dLng = next();
    // A cut-off or garbled string: keep the points decoded so far.
    if (dLat == null || dLng == null) break;
    lat += dLat;
    lng += dLng;
    points.push({ latitude: lat / factor, longitude: lng / factor });
  }
  return points;
}
