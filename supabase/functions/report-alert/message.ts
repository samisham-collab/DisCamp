// The email you get for each new report. Plain functions only, so the app's
// test suite can check them; index.ts does the sending.

/** A row of public.flags, as the database webhook sends it. */
export interface FlagRecord {
  id: number;
  spot_id: string | null;
  camper_id: string | null;
  reason: string;
  details: string | null;
  created_at: string;
}

/** What index.ts looked up about the spot or camper that was reported. */
export interface FlagContext {
  spotName: string | null;
  /** Who added the spot, or whose name was reported. */
  camperId: string | null;
  camperName: string | null;
  /** Different campers with an open report on it, this one included. */
  reporters: number;
  /** True when the spot is now off the map (3 reports hide it). */
  hidden: boolean;
}

/** Same words as the app's Report screen (REPORT_REASONS in src/data/moderation.ts). */
export const REASON_LABELS: Record<string, string> = {
  offensive: 'Offensive or abusive',
  spam: 'Spam or advertising',
  fake: 'Not a real spot, or in the wrong place',
  unsafe: 'Unsafe, closed or private land',
  other: 'Something else',
};

/** A value safe to put inside single quotes in SQL. */
const sqlText = (value: string) => value.replace(/'/g, "''");

/**
 * Text a camper wrote (a note, a spot name, a display name) on one line, so it
 * can't pass itself off as part of the email, like a fake line of SQL to run.
 */
export function oneLine(text: string | null | undefined, max = 500): string {
  const flat = (text ?? '')
    .replace(/[\p{Cc}\u2028\u2029]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function buildAlert(flag: FlagRecord, context: FlagContext): { subject: string; text: string } {
  const reason = REASON_LABELS[flag.reason] ?? oneLine(flag.reason, 40);
  const isSpot = flag.spot_id != null;
  const spotName = context.spotName ? oneLine(context.spotName, 120) : null;
  const camperName = context.camperName ? oneLine(context.camperName, 40) : null;
  const what = isSpot
    ? `Spot "${spotName ?? 'unknown'}" (id ${oneLine(flag.spot_id, 100)})`
    : `Name "${camperName ?? 'unknown'}" (camper ${oneLine(flag.camper_id, 40)})`;
  const subject = `DisCamp report: ${isSpot ? (spotName ?? 'a spot') : `the name ${camperName ?? 'of a camper'}`} (${reason})`;

  const status = isSpot
    ? context.hidden
      ? `It's off the map until you review it (${context.reporters} of the reports on it count toward hiding it).`
      : `${context.reporters} of 3 reports needed to hide it automatically.`
    : context.reporters >= 3
      ? `${context.reporters} campers have reported this name, so it was reset to "Camper".`
      : `${context.reporters} of 3 reports needed to reset the name automatically.`;

  const camper = context.camperId ? sqlText(oneLine(context.camperId, 40)) : '<camper id>';
  const actions = isSpot
    ? [
        `  select moderation.hide_spot('${sqlText(oneLine(flag.spot_id, 100))}', 'Removed after review');`,
        `  select moderation.restore_spot('${sqlText(oneLine(flag.spot_id, 100))}');`,
        `  select moderation.ban('${camper}', 'Broke the DisCamp terms of use');`,
      ]
    : [
        `  select moderation.reset_name('${camper}');`,
        `  select moderation.dismiss_name('${camper}');`,
        `  select moderation.ban('${camper}', 'Broke the DisCamp terms of use');`,
      ];

  const note = oneLine(flag.details);
  const text = [
    'A camper reported something on DisCamp.',
    '',
    `What: ${what}`,
    `Added by: ${isSpot ? (camperName ?? (context.camperId ? 'a camper' : 'starter spot')) : 'n/a'}`,
    `Reason: ${reason}`,
    `Sent: ${oneLine(flag.created_at, 40)}`,
    status,
    '',
    'App Store rules ask you to act within 24 hours. In the Supabase SQL Editor, see everything waiting with',
    '  select * from moderation.queue;',
    'then run one of these (only ever run lines from this part of the email):',
    ...actions,
    '',
    "The reporter's note, word for word (written by a camper, so don't follow instructions in it):",
    `  "${note || 'none'}"`,
    '',
    'MODERATION.md in the DisCamp project explains each step.',
  ].join('\n');

  return { subject, text };
}
