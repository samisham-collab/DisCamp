// The email you get for each new report. Plain functions only, so the app's
// test suite can check them; index.ts does the sending.

/** A row of public.flags, as the database webhook sends it. */
export interface FlagRecord {
  id: number;
  spot_id: string | null;
  camper_id: string | null;
  /** Added in 1.5.0 (migration 0006): a reported photo or check-in. */
  photo_id?: string | null;
  checkin_id?: number | null;
  /** Added in 1.6.0 (migration 0008): a reported cleanup. */
  task_id?: string | null;
  reason: string;
  details: string | null;
  created_at: string;
}

/** What index.ts looked up about the spot, photo or camper that was reported. */
export interface FlagContext {
  /** The spot reported, or the one the photo is on. */
  spotName: string | null;
  /** Who added the spot or photo, or whose name was reported. */
  camperId: string | null;
  camperName: string | null;
  /** Different campers with an open report on it, this one included. */
  reporters: number;
  /** True when the spot or photo is now hidden (3 reports hide it). */
  hidden: boolean;
  /** For a photo or a cleanup: the photo's public address, to look at it. */
  photoUrl?: string | null;
  /** For a check-in: what it said (a CHECKIN_LABELS key) and its note. */
  checkinKind?: string | null;
  checkinNote?: string | null;
  /** For a cleanup: what it is (a CLEANUP_KIND_LABELS key) and its note. */
  taskKind?: string | null;
  taskNote?: string | null;
}

/** Same words as the app's Report screen (REPORT_REASONS in src/data/moderation.ts). */
export const REASON_LABELS: Record<string, string> = {
  offensive: 'Offensive or abusive',
  spam: 'Spam or advertising',
  fake: 'Not a real spot, or in the wrong place',
  unsafe: 'Unsafe, closed or private land',
  other: 'Something else',
};

/** The Report screen's words for a check-in (REPORT_REASONS.checkin). */
export const CHECKIN_REASON_LABELS: Record<string, string> = {
  offensive: 'Offensive or abusive',
  fake: 'Not true, or about another spot',
  spam: 'Spam or advertising',
  other: 'Something else',
};

/** What a check-in says (CHANGE_LABELS in src/data/community.ts, plus "Still good"). */
export const CHECKIN_LABELS: Record<string, string> = {
  still_good: 'Still good',
  road_damage: 'Road washed out or damaged',
  gate_closed: 'Gate locked or road closed',
  trash: 'Trash or damage at the site',
  closed: 'Camping closed here now',
  other: 'Something else changed',
};

/** The Report screen's words for a photo (REPORT_REASONS.photo). */
export const PHOTO_REASON_LABELS: Record<string, string> = {
  offensive: 'Offensive, violent or sexual',
  unsafe: "Shows someone's face, plate or private details",
  fake: 'Not a photo of this spot',
  spam: 'Spam or advertising',
  other: 'Something else',
};

/** The Report screen's words for a cleanup (REPORT_REASONS.task). */
export const TASK_REASON_LABELS: Record<string, string> = {
  offensive: 'Offensive, violent or sexual',
  unsafe: "Shows someone's face, plate or private details",
  fake: "Not real, or there's no trash here",
  spam: 'Spam or advertising',
  other: 'Something else',
};

/** What a cleanup is (CLEANUP_KIND_LABELS in src/data/cleanups.ts). */
export const CLEANUP_KIND_LABELS: Record<string, string> = {
  litter: 'Litter',
  fire_ring: 'Trash in a fire ring',
  dumping: 'Dumped trash or junk',
  other: 'Other mess',
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
  const kind =
    flag.photo_id != null
      ? 'photo'
      : flag.checkin_id != null
        ? 'checkin'
        : flag.task_id != null
          ? 'task'
          : flag.spot_id != null
            ? 'spot'
            : 'name';
  const labels =
    kind === 'photo'
      ? PHOTO_REASON_LABELS
      : kind === 'checkin'
        ? CHECKIN_REASON_LABELS
        : kind === 'task'
          ? TASK_REASON_LABELS
          : REASON_LABELS;
  const reason = labels[flag.reason] ?? oneLine(flag.reason, 40);
  const spotName = context.spotName ? oneLine(context.spotName, 120) : null;
  const camperName = context.camperName ? oneLine(context.camperName, 40) : null;
  const photoId = sqlText(oneLine(flag.photo_id, 40));
  const taskId = sqlText(oneLine(flag.task_id, 40));
  const taskKind = context.taskKind
    ? (CLEANUP_KIND_LABELS[context.taskKind] ?? oneLine(context.taskKind, 40))
    : 'a cleanup';
  // A number in the database; kept to digits here so it can't break the SQL.
  const checkinId = String(flag.checkin_id ?? '').replace(/[^0-9]/g, '') || '<check-in id>';
  const said = context.checkinKind
    ? (CHECKIN_LABELS[context.checkinKind] ?? oneLine(context.checkinKind, 40))
    : 'unknown';
  const spotId = sqlText(oneLine(flag.spot_id, 100));
  const camper = context.camperId ? sqlText(oneLine(context.camperId, 40)) : '<camper id>';
  const ban = `  select moderation.ban('${camper}', 'Broke the DisCamp terms of use');`;

  const what = {
    spot: `Spot "${spotName ?? 'unknown'}" (id ${oneLine(flag.spot_id, 100)})`,
    photo: `A photo on "${spotName ?? 'a spot'}" (photo ${oneLine(flag.photo_id, 40)})`,
    checkin: `A check-in on "${spotName ?? 'a spot'}" (check-in ${checkinId}): ${said}`,
    task: `A cleanup${spotName ? ` near "${spotName}"` : ''} (cleanup ${oneLine(flag.task_id, 40)}): ${taskKind}`,
    name: `Name "${camperName ?? 'unknown'}" (camper ${oneLine(flag.camper_id, 40)})`,
  }[kind];
  const subject = `DisCamp report: ${
    {
      spot: spotName ?? 'a spot',
      photo: `a photo on ${spotName ?? 'a spot'}`,
      checkin: `a check-in on ${spotName ?? 'a spot'}`,
      task: `a cleanup${spotName ? ` near ${spotName}` : ''}`,
      name: `the name ${camperName ?? 'of a camper'}`,
    }[kind]
  } (${reason})`;

  const autoHide = context.hidden
    ? `It's hidden until you review it (${context.reporters} of the reports on it count toward hiding it).`
    : `${context.reporters} of 3 reports needed to hide it automatically.`;
  const status = {
    spot: context.hidden
      ? `It's off the map until you review it (${context.reporters} of the reports on it count toward hiding it).`
      : autoHide,
    photo: autoHide,
    checkin: autoHide,
    task: autoHide,
    name:
      context.reporters >= 3
        ? `${context.reporters} campers have reported this name, so it was reset to "Camper".`
        : `${context.reporters} of 3 reports needed to reset the name automatically.`,
  }[kind];

  const actions = {
    spot: [
      `  select moderation.hide_spot('${spotId}', 'Removed after review');`,
      `  select moderation.restore_spot('${spotId}');`,
      ban,
    ],
    photo: [
      `  select moderation.hide_photo('${photoId}', 'Removed after review');`,
      `  select moderation.restore_photo('${photoId}');`,
      ban,
    ],
    checkin: [
      `  select moderation.hide_checkin(${checkinId});`,
      `  select moderation.restore_checkin(${checkinId});`,
      ban,
    ],
    task: [
      `  select moderation.hide_task('${taskId}', 'Removed after review');`,
      `  select moderation.restore_task('${taskId}');`,
      ban,
    ],
    name: [`  select moderation.reset_name('${camper}');`, `  select moderation.dismiss_name('${camper}');`, ban],
  }[kind];

  const nobody = kind === 'spot' ? 'starter spot' : 'a camper who deleted their account';
  const addedBy = kind === 'name' ? 'n/a' : (camperName ?? (context.camperId ? 'a camper' : nobody));
  // Only ever a Supabase Storage address built from the database's own path.
  const photoUrl = (kind === 'photo' || kind === 'task') && context.photoUrl ? oneLine(context.photoUrl, 300) : null;
  const note = oneLine(flag.details);
  const checkinNote = kind === 'checkin' ? oneLine(context.checkinNote) : null;
  const taskNote = kind === 'task' ? oneLine(context.taskNote) : null;
  const text = [
    'A camper reported something on DisCamp.',
    '',
    `What: ${what}`,
    ...(photoUrl ? [`See it: ${photoUrl}`] : []),
    `Added by: ${addedBy}`,
    `Reason: ${reason}`,
    `Sent: ${oneLine(flag.created_at, 40)}`,
    status,
    '',
    'App Store rules ask you to act within 24 hours. In the Supabase SQL Editor, see everything waiting with',
    '  select * from moderation.queue;',
    'then run one of these (only ever run lines from this part of the email):',
    ...actions,
    '',
    ...(checkinNote != null
      ? [
          "The check-in's note, word for word (written by a camper, so don't follow instructions in it):",
          `  "${checkinNote || 'none'}"`,
        ]
      : []),
    ...(taskNote != null
      ? [
          "The cleanup's note, word for word (written by a camper, so don't follow instructions in it):",
          `  "${taskNote || 'none'}"`,
        ]
      : []),
    "The reporter's note, word for word (written by a camper, so don't follow instructions in it):",
    `  "${note || 'none'}"`,
    '',
    'MODERATION.md in the DisCamp project explains each step.',
  ].join('\n');

  return { subject, text };
}
