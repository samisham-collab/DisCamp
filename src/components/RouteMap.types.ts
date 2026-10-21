import type { Coordinates } from '../types';

export interface RouteMapProps {
  /** The whole route; empty while it's being worked out. */
  path: Coordinates[];
  /** Unpaved or rough stretches, drawn on top in orange. */
  roughSegments: Coordinates[][];
  destination: Coordinates & { name: string };
  satellite: boolean;
}
