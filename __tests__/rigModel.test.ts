import { describe, expect, it } from '@jest/globals';

import { RIG_PRESETS } from '@/lib/rigPresets';
import {
  changeRig,
  DEFAULT_RIG,
  defaultLengthFor,
  matchingPreset,
  normalizeRig,
  rigDisplayName,
  rigSummary,
  sameRig,
} from '@/lib/rigModel';
import type { Rig } from '@/types';

import { preset } from '../test/fixtures';

const rig = (patch: Partial<Rig>): Rig => ({ ...DEFAULT_RIG, ...patch });

describe('normalizeRig', () => {
  it('leaves valid presets unchanged', () => {
    for (const p of RIG_PRESETS) expect(normalizeRig(p)).toEqual(p);
  });

  it('clamps and rounds clearance to the half inch', () => {
    expect(normalizeRig(rig({ clearanceIn: 0 })).clearanceIn).toBe(2);
    expect(normalizeRig(rig({ clearanceIn: 99 })).clearanceIn).toBe(24);
    expect(normalizeRig(rig({ clearanceIn: 9.3 })).clearanceIn).toBe(9.5);
  });

  it('drops the length when not towing and fills a default when towing', () => {
    expect(normalizeRig(rig({ setup: 'rtt', lengthFt: 30 })).lengthFt).toBe(0);
    expect(normalizeRig(rig({ setup: 'trailer', lengthFt: 0 })).lengthFt).toBe(25);
    expect(normalizeRig(rig({ setup: 'bigrig', lengthFt: 0 })).lengthFt).toBe(40);
    expect(normalizeRig(rig({ setup: 'trailer', lengthFt: 3 })).lengthFt).toBe(8);
    expect(normalizeRig(rig({ setup: 'bigrig', lengthFt: 80 })).lengthFt).toBe(60);
  });

  it('caps the name length', () => {
    expect(normalizeRig(rig({ name: 'x'.repeat(100) })).name).toHaveLength(40);
  });

  it('gives each towing setup a sensible default length', () => {
    expect(defaultLengthFor('trailer')).toBe(25);
    expect(defaultLengthFor('bigrig')).toBe(40);
  });
});

describe('describing a rig', () => {
  it('falls back to "My rig" for a blank name', () => {
    expect(rigDisplayName(rig({ name: '   ' }))).toBe('My rig');
    expect(rigDisplayName(rig({ name: ' Blue truck ' }))).toBe('Blue truck');
  });

  it('summarizes clearance, drivetrain and setup', () => {
    expect(rigSummary(preset('Mid-size 4x4 + RTT'))).toBe('9 in · 4WD · Rooftop tent');
    expect(rigSummary(preset('Truck + 25 ft trailer'))).toBe('8 in · 4WD · 25 ft trailer');
    expect(rigSummary(preset('40 ft Class A'))).toBe('7 in · 2WD · 40 ft big rig');
    expect(rigSummary(rig({ clearanceIn: 9.5 }))).toBe('9.5 in · 4WD · Rooftop tent');
  });
});

describe('presets', () => {
  it('recognizes an unchanged preset, ignoring name padding', () => {
    expect(matchingPreset(preset('Sedan'))?.name).toBe('Sedan');
    expect(matchingPreset({ ...preset('Sedan'), name: ' Sedan ' })?.name).toBe('Sedan');
  });

  it('treats any change as a custom rig', () => {
    expect(matchingPreset({ ...preset('Sedan'), clearanceIn: 6 })).toBeUndefined();
    expect(sameRig(preset('Sedan'), { ...preset('Sedan'), drivetrain: 'awd' })).toBe(false);
  });

  it('has unique preset names and a default that is one of them', () => {
    const names = RIG_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(matchingPreset(DEFAULT_RIG)).toBeDefined();
  });
});

describe('changeRig', () => {
  it('makes a rig switched to "big rig" at least big-rig length', () => {
    const trailer = preset('Truck + 25 ft trailer');
    expect(changeRig(trailer, { setup: 'bigrig' }).lengthFt).toBe(40);
    expect(changeRig({ ...trailer, lengthFt: 45 }, { setup: 'bigrig' }).lengthFt).toBe(45);
    expect(changeRig(trailer, { setup: 'bigrig', lengthFt: 38 }).lengthFt).toBe(38);
    expect(changeRig(trailer, { clearanceIn: 10 })).toEqual({ ...trailer, clearanceIn: 10 });
  });

  it("cuts a long name by character, so an emoji isn't split", () => {
    const name = `${'a'.repeat(39)}🚙`;
    expect(normalizeRig({ ...DEFAULT_RIG, name: `${name}xyz` }).name).toBe(name);
  });
});
