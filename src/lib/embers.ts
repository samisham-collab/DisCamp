// Embers (DisCamp's points) and the ranks they reach. The database decides
// who earns what (migration 0008); these are the same numbers, for showing
// campers what they can earn and where they stand.

export type EmberReason =
  'cleanup' | 'cleanup_reported' | 'spot_confirmed' | 'still_good' | 'change_report' | 'photo' | 'taken_back';

export type CleanupSize = 'small' | 'medium' | 'large';

/** Embers for an approved cleanup, by size. */
export const CLEANUP_EMBERS: Record<CleanupSize, number> = { small: 50, medium: 100, large: 150 };

/** What each thing earns (once; see EARNING_RULES for how often). */
export const EMBERS = {
  cleanupReported: 10,
  spotConfirmed: 50,
  stillGood: 10,
  changeReport: 10,
  photo: 5,
} as const;

/** The most Embers a camper earns in a day, in their first two weeks, and from check-ins. */
export const DAILY_LIMIT = 300;
export const NEW_ACCOUNT_DAILY_LIMIT = 100;
export const CHECKIN_DAILY_LIMIT = 50;

/** How campers earn Embers, in the words the app shows. */
export const EARNING_RULES: readonly { label: string; embers: string }[] = [
  {
    label: 'Clean up a site (approved)',
    embers: `${CLEANUP_EMBERS.small} / ${CLEANUP_EMBERS.medium} / ${CLEANUP_EMBERS.large}`,
  },
  { label: 'A cleanup you posted gets cleaned up', embers: String(EMBERS.cleanupReported) },
  { label: 'A spot you added is confirmed by 2 campers', embers: String(EMBERS.spotConfirmed) },
  { label: 'Say "Still good" about a spot (first time)', embers: String(EMBERS.stillGood) },
  { label: 'Report a change at a spot (first time)', embers: String(EMBERS.changeReport) },
  { label: 'Add a photo of a spot (up to 3 a spot)', embers: String(EMBERS.photo) },
];

export const REASON_LABELS: Record<EmberReason, string> = {
  cleanup: 'Cleanup approved',
  cleanup_reported: 'Your cleanup was cleaned up',
  spot_confirmed: 'Your spot was confirmed',
  still_good: '"Still good"',
  change_report: 'Change report',
  photo: 'Photo',
  taken_back: 'Taken back after review',
};

export interface Rank {
  name: string;
  /** Embers needed to reach it. */
  min: number;
}

export const RANKS: readonly Rank[] = [
  { name: 'Tenderfoot', min: 0 },
  { name: 'Scout', min: 250 },
  { name: 'Trailblazer', min: 1_000 },
  { name: 'Pathfinder', min: 3_000 },
  { name: 'Steward', min: 7_500 },
  { name: 'Guardian', min: 15_000 },
];

export interface Standing {
  rank: Rank;
  /** The next rank, or null at the top. */
  next: Rank | null;
  /** How far from this rank to the next, 0 to 1 (1 at the top). */
  progress: number;
  /** Embers still needed for the next rank (0 at the top). */
  toNext: number;
}

/** Where a camper with `total` Embers stands. */
export function standingFor(total: number): Standing {
  const embers = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  let index = 0;
  for (let i = 0; i < RANKS.length; i += 1) {
    if (embers >= (RANKS[i] as Rank).min) index = i;
  }
  const rank = RANKS[index] as Rank;
  const next = RANKS[index + 1] ?? null;
  if (!next) return { rank, next: null, progress: 1, toNext: 0 };
  return { rank, next, progress: (embers - rank.min) / (next.min - rank.min), toNext: next.min - embers };
}

/** "1,250 Embers", "1 Ember". */
export function formatEmbers(count: number): string {
  return `${count.toLocaleString('en-US')} ${Math.abs(count) === 1 ? 'Ember' : 'Embers'}`;
}

/** "+10", "−5" (a real minus sign), "0". */
export function formatChange(amount: number): string {
  if (amount > 0) return `+${amount.toLocaleString('en-US')}`;
  if (amount < 0) return `−${Math.abs(amount).toLocaleString('en-US')}`;
  return '0';
}
