import type { Coordinates } from '../types';

export interface RouteMapProps {
  /** The whole route; empty while it's being worked out. */
  path: Coordinates[];
  /** Unpaved or rough stretches, drawn on top in orange. */
  roughSegments: Coordinates[][];
  destination: Coordinates & { name: string };
  satellite: boolean;
  /** Drive mode: keep the camera on the camper, turned the way they're heading. */
  follow?: { center: Coordinates; heading: number } | null;
  /** The camper moved the map themselves (Drive mode stops following until they re-center). */
  onUserPan?: () => void;
}
