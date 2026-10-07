// Cost meter: what it costs to stay at a spot, per night.
// Trailers and big rigs are priced on the RV / hookup fee when a spot has one.

import type { Hookup, Rig, Spot, SpotCost } from '../types';
import { isTowing } from './fit';

export type CostLevel = 0 | 1 | 2 | 3;

export const COST_LEVELS: Record<CostLevel, { symbol: string; label: string; range: string }> = {
  0: { symbol: 'Free', label: 'Free', range: '$0 a night' },
  1: { symbol: '$', label: 'Low', range: 'Under $15 a night' },
  2: { symbol: '$$', label: 'Moderate', range: '$15–30 a night' },
  3: { symbol: '$$$', label: 'High', range: 'Over $30 a night' },
};

export function costLevel(feeUsd: number | null): CostLevel | null {
  if (feeUsd == null || !Number.isFinite(feeUsd)) return null;
  if (feeUsd <= 0) return 0;
  if (feeUsd < 15) return 1;
  if (feeUsd <= 30) return 2;
  return 3;
}

export interface RigCost {
  feeUsd: number | null;
  level: CostLevel | null;
  /** Which fee applied, in plain words that read well mid-sentence. */
  basis: 'RV site' | 'standard site';
}

/**
 * The nightly fee that applies to this rig at this spot. Trailers and big rigs
 * pay the RV site fee. When a spot has hookup sites but nobody has reported
 * their fee, the cost is unknown: the standard (often free) fee would be a guess.
 */
export function costForRig(spot: Pick<Spot, 'cost'>, rig: Pick<Rig, 'setup'>): RigCost {
  const { nightlyFeeUsd, rvFeeUsd, hookups } = spot.cost;
  if (isTowing(rig)) {
    if (rvFeeUsd != null) return { feeUsd: rvFeeUsd, level: costLevel(rvFeeUsd), basis: 'RV site' };
    if (hookups.length > 0) return { feeUsd: null, level: null, basis: 'RV site' };
  }
  return { feeUsd: nightlyFeeUsd, level: costLevel(nightlyFeeUsd), basis: 'standard site' };
}

export function formatFee(feeUsd: number | null): string {
  if (feeUsd == null || !Number.isFinite(feeUsd)) return 'Not reported';
  if (feeUsd <= 0) return 'Free';
  return `$${Number.isInteger(feeUsd) ? feeUsd : feeUsd.toFixed(2)} a night`;
}

/** What to show for the RV site fee, which may be missing for different reasons. */
export function describeRvFee(cost: Pick<SpotCost, 'nightlyFeeUsd' | 'rvFeeUsd' | 'hookups'>): string {
  if (cost.rvFeeUsd != null) return formatFee(cost.rvFeeUsd);
  // Hookup sites usually cost extra, so don't assume they match the standard fee.
  if (cost.hookups.length === 0 && cost.nightlyFeeUsd != null) return 'Same as standard';
  return 'Not reported';
}

const HOOKUP_LABELS: Record<Hookup, string> = {
  electric: 'Electric',
  water: 'Water',
  sewer: 'Sewer',
};

export function formatHookups(hookups: Hookup[]): string {
  if (!hookups.length) return 'None';
  return hookups.map((h) => HOOKUP_LABELS[h]).join(', ');
}
