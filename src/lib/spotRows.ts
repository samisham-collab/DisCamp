// Combines spots with the current rig, filters and location into the rows
// the map and list show. Pure functions, no React.

import type { Coordinates, Spot } from '../types';
import { costForRig, type RigCost } from './cost';
import { FIT_ORDER, fitFor, type FitResult, type FitRig } from './fit';
import { bearingDegrees, compassPoint, distanceMiles, type CompassPoint } from './geo';
import type { SpotFilter } from './schemas';

export interface SpotRow {
  spot: Spot;
  fit: FitResult;
  cost: RigCost;
  /** Miles from the camper, when their location is known. */
  distanceMi: number | null;
  /** Which way the spot is from the camper, when their location is known. */
  direction: CompassPoint | null;
}

export function buildSpotRows(spots: Spot[], rig: FitRig, here: Coordinates | null): SpotRow[] {
  return spots.map((spot) => ({
    spot,
    fit: fitFor(spot, rig),
    cost: costForRig(spot, rig),
    distanceMi: here ? distanceMiles(here, spot) : null,
    direction: here ? compassPoint(bearingDegrees(here, spot)) : null,
  }));
}

export function applyFilters(rows: SpotRow[], filters: readonly SpotFilter[]): SpotRow[] {
  return rows.filter(({ fit, cost }) => {
    if (filters.includes('fits') && !(fit.status === 'fits' || fit.status === 'tight')) return false;
    if (filters.includes('free') && cost.level !== 0) return false;
    return true;
  });
}

/** Best fit first, then nearest, then by name. */
export function sortRows(rows: SpotRow[]): SpotRow[] {
  return [...rows].sort((a, b) => {
    const byFit = FIT_ORDER[a.fit.status] - FIT_ORDER[b.fit.status];
    if (byFit !== 0) return byFit;
    if (a.distanceMi != null && b.distanceMi != null && a.distanceMi !== b.distanceMi) {
      return a.distanceMi - b.distanceMi;
    }
    return a.spot.name.localeCompare(b.spot.name);
  });
}

/** "1 spot", "3 spots", "1 spot matches your filters". */
export function countLabel(count: number, filtered: boolean): string {
  if (!filtered) return `${count} ${count === 1 ? 'spot' : 'spots'}`;
  return `${count} ${count === 1 ? 'spot matches' : 'spots match'} your filters`;
}
