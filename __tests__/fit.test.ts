import { describe, expect, it } from '@jest/globals';

import { SEED_SPOTS } from '@/data/seedSpots';
import { CLEARANCE_TIERS, FIT_ORDER, fitFor, isTowing, maxTierFor, tierInfo } from '@/lib/fit';

import { baseSpot, makeSpot, preset } from '../test/fixtures';

describe('clearance tiers', () => {
  it('lists C1 to C7 in order with rising minimums', () => {
    expect(CLEARANCE_TIERS.map((t) => t.tier)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const mins = CLEARANCE_TIERS.map((t) => t.minIn);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
    expect(tierInfo(4).label).toBe('8–10"');
  });

  it('maps clearance to the highest tier a vehicle can handle', () => {
    expect(maxTierFor(1.5)).toBe(0);
    expect(maxTierFor(2)).toBe(1);
    expect(maxTierFor(5.5)).toBe(2);
    expect(maxTierFor(9)).toBe(4);
    expect(maxTierFor(12)).toBe(6);
    expect(maxTierFor(16)).toBe(7);
    expect(maxTierFor(30)).toBe(7);
  });
});

describe('fitFor', () => {
  it('fits a 4x4 with a rooftop tent on a C4 road', () => {
    const result = fitFor(baseSpot, preset('Mid-size 4x4 + RTT'));
    expect(result).toEqual({ status: 'fits', headline: 'Fits your rig', reasons: [], notes: [] });
  });

  it('rejects a sedan two tiers below the road', () => {
    const result = fitFor(baseSpot, preset('Sedan'));
    expect(result.status).toBe('no');
    expect(result.reasons[0]).toContain('Needs C4');
  });

  it('calls one tier above the rig tight', () => {
    expect(fitFor(makeSpot({ access: { clearanceTier: 3 } }), preset('Sedan')).status).toBe('tight');
  });

  it('treats a recommended drivetrain as tight and a required one as a no', () => {
    const sedan = preset('Sedan');
    expect(fitFor(makeSpot({ access: { clearanceTier: 2, drivetrain: 'awd-recommended' } }), sedan).status).toBe(
      'tight',
    );
    expect(fitFor(makeSpot({ access: { clearanceTier: 2, drivetrain: '4wd-required' } }), sedan).status).toBe('no');
    expect(fitFor(makeSpot({ access: { drivetrain: '4wd-lockers' } }), preset('Mid-size 4x4 + RTT')).status).toBe('no');
  });

  it('checks the camping setup', () => {
    expect(fitFor(makeSpot({ fit: { tent: false } }), { ...preset('Sedan'), clearanceIn: 9 }).status).toBe('no');
    expect(fitFor(makeSpot({ fit: { rtt: false } }), preset('Mid-size 4x4 + RTT')).reasons).toContain(
      'No level parking for a rooftop tent',
    );
    expect(fitFor(makeSpot({ access: { clearanceTier: 3 }, fit: { van: false } }), preset('Camper van')).status).toBe(
      'no',
    );
  });

  it('checks trailer length', () => {
    const trailer = preset('Truck + 25 ft trailer');
    expect(fitFor(makeSpot({ access: { clearanceTier: 3 } }), trailer).status).toBe('fits');
    const short = fitFor(makeSpot({ access: { clearanceTier: 3 }, fit: { maxTrailerFt: 15 } }), trailer);
    expect(short.status).toBe('no');
    expect(short.reasons).toContain('Fits up to 15 ft; yours is 25 ft');
    expect(fitFor(makeSpot({ access: { clearanceTier: 3 }, fit: { maxTrailerFt: 0 } }), trailer).reasons).toContain(
      'No room for a trailer',
    );
  });

  it('needs big-rig suitability and a turnaround for big rigs', () => {
    const bigRig = preset('40 ft Class A');
    const easyRoad = { clearanceTier: 1 as const };
    expect(fitFor(makeSpot({ access: easyRoad, fit: { maxTrailerFt: 45 } }), bigRig).status).toBe('no');
    expect(
      fitFor(makeSpot({ access: easyRoad, fit: { maxTrailerFt: 45, bigRig: true, turnaround: true } }), bigRig).status,
    ).toBe('fits');
  });

  it('treats a trailer 40 ft or longer as a big rig', () => {
    const easyRoad = { clearanceTier: 1 as const };
    const long = { ...preset('Truck + 25 ft trailer'), lengthFt: 45 };
    const short = { ...preset('Truck + 25 ft trailer'), lengthFt: 39 };
    const notForBigRigs = makeSpot({ access: easyRoad, fit: { maxTrailerFt: 50, bigRig: false, turnaround: true } });
    expect(fitFor(notForBigRigs, long).status).toBe('no');
    expect(fitFor(notForBigRigs, short).status).toBe('fits');
    const noTurnaround = makeSpot({ access: easyRoad, fit: { maxTrailerFt: 50, bigRig: true, turnaround: false } });
    expect(fitFor(noTurnaround, long).reasons).toContain('No turnaround');
  });

  it('reports unknown instead of guessing when data is missing', () => {
    const result = fitFor(
      makeSpot({ access: { clearanceTier: 1 }, fit: { maxTrailerFt: null } }),
      preset('Truck + 25 ft trailer'),
    );
    expect(result.status).toBe('unknown');
    expect(result.headline).toBe('Not enough reports to tell');
    expect(result.reasons).toContain('Max length not reported');
  });

  it('treats missing access data as unknown', () => {
    const result = fitFor(makeSpot({ access: { clearanceTier: null, drivetrain: null } }), preset('Sedan'));
    expect(result.status).toBe('unknown');
    expect(result.reasons).toEqual(['Clearance not reported', 'Drivetrain needs not reported']);
  });

  it('ranks problems above missing reports above cautions', () => {
    const rig = preset('Truck + 25 ft trailer');
    expect(fitFor(makeSpot({ access: { clearanceTier: 7 }, fit: { maxTrailerFt: null } }), rig).status).toBe('no');
    // A rough road plus an unreported length: can't promise "tight", so it's unknown,
    // and the rough road is still listed.
    const gaps = fitFor(makeSpot({ access: { clearanceTier: 5 }, fit: { maxTrailerFt: null } }), rig);
    expect(gaps.status).toBe('unknown');
    expect(gaps.reasons).toEqual(['Road is C5 (10–12"), one tier above your 8"', 'Max length not reported']);
    expect(fitFor(makeSpot({ access: { clearanceTier: 5 }, fit: { maxTrailerFt: 40 } }), rig).status).toBe('tight');
  });

  it('never lets a spot with missing reports pass as a fit', () => {
    const sedan = preset('Sedan');
    const result = fitFor(makeSpot({ access: { clearanceTier: 3 }, fit: { tent: null } }), sedan);
    expect(result.status).toBe('unknown');
  });

  it('adds a wet-road note without changing the verdict', () => {
    const result = fitFor(makeSpot({ access: { impassableWhenWet: true } }), preset('Mid-size 4x4 + RTT'));
    expect(result.status).toBe('fits');
    expect(result.notes).toEqual(['Road is impassable when wet: check the forecast']);
  });

  it('orders statuses best first', () => {
    expect(FIT_ORDER.fits).toBeLessThan(FIT_ORDER.tight);
    expect(FIT_ORDER.tight).toBeLessThan(FIT_ORDER.unknown);
    expect(FIT_ORDER.unknown).toBeLessThan(FIT_ORDER.no);
  });

  it('knows which setups tow', () => {
    expect(isTowing({ setup: 'trailer' })).toBe(true);
    expect(isTowing({ setup: 'bigrig' })).toBe(true);
    expect(isTowing({ setup: 'rtt' })).toBe(false);
  });
});

describe('Smoky Gardens seed', () => {
  const smoky = SEED_SPOTS.find((s) => s.id === 'smoky-gardens');
  if (!smoky) throw new Error('Smoky Gardens is missing from the seed');

  it('fits tent and rooftop-tent campers', () => {
    expect(fitFor(smoky, preset('Sedan')).status).toBe('fits');
    expect(fitFor(smoky, preset('Mid-size 4x4 + RTT')).status).toBe('fits');
  });

  it('asks for a camper report before promising big rigs a fit', () => {
    const result = fitFor(smoky, preset('40 ft Class A'));
    expect(result.status).toBe('unknown');
    expect(result.reasons).toEqual(
      expect.arrayContaining(['Big-rig fit not reported', 'Turnaround not reported', 'Max length not reported']),
    );
  });
});
