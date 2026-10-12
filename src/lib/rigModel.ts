// Rules for a valid rig: clamping, presets and how a rig is described.
// Pure functions, no React.

import { MAX_RIG_NAME_LENGTH } from '../config';
import type { Rig } from '../types';
import { RIG_DRIVETRAINS, RIG_SETUPS, isTowing } from './fit';
import { RIG_PRESETS } from './rigPresets';

export const CLEARANCE_RANGE = { min: 2, max: 24, step: 0.5 } as const;
export const LENGTH_RANGE = { min: 8, max: 60, step: 1 } as const;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Default length when switching into a towing setup. */
export function defaultLengthFor(setup: Rig['setup']): number {
  return setup === 'bigrig' ? 40 : 25;
}

/**
 * A change to the rig. Switching to a big rig makes it at least big-rig
 * length (40 ft), so a 25 ft trailer doesn't become a "25 ft big rig".
 */
export function changeRig(prev: Rig, patch: Partial<Rig>): Rig {
  const next = { ...prev, ...patch };
  if (patch.setup === 'bigrig' && prev.setup !== 'bigrig' && patch.lengthFt == null) {
    next.lengthFt = Math.max(prev.lengthFt, defaultLengthFor('bigrig'));
  }
  return next;
}

/** Bring any rig into the valid range: called on every change and on load. */
export function normalizeRig(rig: Rig): Rig {
  const clearanceIn = clamp(roundTo(rig.clearanceIn, CLEARANCE_RANGE.step), CLEARANCE_RANGE.min, CLEARANCE_RANGE.max);
  const towing = isTowing(rig);
  const lengthFt = towing
    ? clamp(roundTo(rig.lengthFt || defaultLengthFor(rig.setup), LENGTH_RANGE.step), LENGTH_RANGE.min, LENGTH_RANGE.max)
    : 0;
  return {
    // By character, so an emoji at the end isn't cut in half.
    name: Array.from(rig.name).slice(0, MAX_RIG_NAME_LENGTH).join(''),
    clearanceIn,
    drivetrain: rig.drivetrain,
    setup: rig.setup,
    lengthFt,
  };
}

/** The name to show: the user's, or a sensible fallback while it is blank. */
export function rigDisplayName(rig: Rig): string {
  return rig.name.trim() || 'My rig';
}

/** "9 in · 4WD · Rooftop tent" or "8 in · 4WD · 25 ft trailer". */
export function rigSummary(rig: Rig): string {
  const parts = [`${rig.clearanceIn} in`, RIG_DRIVETRAINS[rig.drivetrain].label];
  if (rig.setup === 'trailer') parts.push(`${rig.lengthFt} ft trailer`);
  else if (rig.setup === 'bigrig') parts.push(`${rig.lengthFt} ft big rig`);
  else parts.push(RIG_SETUPS[rig.setup].short);
  return parts.join(' · ');
}

export function sameRig(a: Rig, b: Rig): boolean {
  return (
    a.name.trim() === b.name.trim() &&
    a.clearanceIn === b.clearanceIn &&
    a.drivetrain === b.drivetrain &&
    a.setup === b.setup &&
    a.lengthFt === b.lengthFt
  );
}

/** The preset this rig still matches exactly, if any. */
export function matchingPreset(rig: Rig): Rig | undefined {
  return RIG_PRESETS.find((p) => sameRig(p, rig));
}

export const DEFAULT_RIG: Rig = RIG_PRESETS[1] ?? {
  name: 'Mid-size 4x4 + RTT',
  clearanceIn: 9,
  drivetrain: '4wd',
  setup: 'rtt',
  lengthFt: 0,
};
