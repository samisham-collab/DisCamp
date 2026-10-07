// Shared data shapes for DisCamp.
// `null` always means "not reported yet": the app shows it as unknown
// instead of guessing. Runtime validation for these lives in src/lib/schemas.ts.

/** Clearance tiers C1–C7. See CLEARANCE_TIERS in src/lib/fit.ts. */
export type ClearanceTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** What the road to a spot needs. */
export type SpotDrivetrain = '2wd-ok' | 'awd-recommended' | '4wd-required' | '4wd-lockers';

/** What a camper's vehicle has. */
export type RigDrivetrain = '2wd' | 'awd' | '4wd' | '4wd-lockers';

/** How the camper sleeps. Trailer and big rig also use `lengthFt`. */
export type RigSetup = 'tent' | 'rtt' | 'van' | 'trailer' | 'bigrig';

export type Hookup = 'electric' | 'water' | 'sewer';

export type SiteType = 'dispersed' | 'campground';

export type Reservations = 'first-come' | 'reservable' | 'not-needed';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface SpotAccess {
  clearanceTier: ClearanceTier | null;
  drivetrain: SpotDrivetrain | null;
  surface: string | null;
  impassableWhenWet: boolean | null;
}

export interface SpotFit {
  tent: boolean | null;
  rtt: boolean | null;
  van: boolean | null;
  /** Longest trailer or RV that fits, in feet. 0 = no trailers. */
  maxTrailerFt: number | null;
  bigRig: boolean | null;
  turnaround: boolean | null;
}

export interface SpotCost {
  /** Standard or dry-camping site, per night. 0 = free. */
  nightlyFeeUsd: number | null;
  /** RV / hookup site, per night, when it differs from the standard fee. */
  rvFeeUsd: number | null;
  hookups: Hookup[];
  reservations: Reservations | null;
  notes?: string;
}

export interface SourceLink {
  label: string;
  url: string;
}

export interface Spot extends Coordinates {
  id: string;
  name: string;
  siteType: SiteType;
  landManager: string;
  stayLimitDays: number | null;
  access: SpotAccess;
  fit: SpotFit;
  cost: SpotCost;
  amenities: string[];
  rules: string[];
  directions?: string;
  phone?: string;
  /** true once campers have confirmed the details on site. */
  verified: boolean;
  reportCount: number;
  sources: SourceLink[];
}

export interface Rig {
  name: string;
  clearanceIn: number;
  drivetrain: RigDrivetrain;
  setup: RigSetup;
  /** Trailer or RV length in feet; 0 when not towing. */
  lengthFt: number;
}
