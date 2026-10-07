// Starting points for My Rig. Kept separate from rig.tsx so tests can use
// them without loading phone storage.

import type { Rig } from '../types';

export const RIG_PRESETS: Rig[] = [
  { name: 'Sedan', clearanceIn: 5.5, drivetrain: '2wd', setup: 'tent', lengthFt: 0 },
  { name: 'Mid-size 4x4 + RTT', clearanceIn: 9, drivetrain: '4wd', setup: 'rtt', lengthFt: 0 },
  { name: 'Camper van', clearanceIn: 7, drivetrain: '2wd', setup: 'van', lengthFt: 0 },
  { name: 'Truck + 25 ft trailer', clearanceIn: 8, drivetrain: '4wd', setup: 'trailer', lengthFt: 25 },
  { name: '40 ft Class A', clearanceIn: 7, drivetrain: '2wd', setup: 'bigrig', lengthFt: 40 },
];
