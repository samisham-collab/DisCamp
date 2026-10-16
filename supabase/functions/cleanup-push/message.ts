// The phone notifications for cleanups. Plain functions only, so the app's
// test suite can check them; index.ts does the sending.

/** A row of public.cleanup_completions, as the database webhook sends it. */
export interface CompletionRecord {
  id: string;
  task_id: string;
  camper_id: string | null;
  status: string;
}

/** What the webhook says happened. */
export interface WebhookPayload {
  type?: string;
  table?: string;
  record?: CompletionRecord | null;
  old_record?: CompletionRecord | null;
}

/** What just happened to a cleanup sent for review. */
export type PushEvent = 'sent' | 'approved' | 'rejected';

/** A row of public.cleanup_push_targets(): one phone to tell, and the facts for the message. */
export interface PushTarget {
  token: string;
  role: 'moderator' | 'approved' | 'sent_back' | 'poster';
  task_id: string;
  kind: string;
  size: string | null;
  spot_name: string | null;
  embers: number | null;
  reason: string | null;
}

/** A message for Expo's push service (https://docs.expo.dev/push-notifications/sending-notifications/). */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: { url: string };
  sound: 'default';
  channelId: 'cleanups';
}

/** Expo's answer for one message. */
export interface PushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** Same words as the app (CLEANUP_KIND_LABELS in src/data/cleanups.ts), for the middle of a sentence. */
export const CLEANUP_KIND_WORDS: Record<string, string> = {
  litter: 'litter',
  fire_ring: 'trash in a fire ring',
  dumping: 'dumped trash',
  other: 'mess',
};

/** Expo sends at most 100 messages per request. */
export const PUSH_BATCH = 100;

/** Notifications show about this much text; longer bodies are cut with "…". */
const MAX_BODY = 178;

export function eventFor(payload: WebhookPayload | null): PushEvent | null {
  if (!payload || payload.table !== 'cleanup_completions' || !payload.record) return null;
  const now = payload.record.status;
  if (payload.type === 'INSERT') return now === 'pending' ? 'sent' : null;
  if (payload.type === 'UPDATE' && payload.old_record?.status === 'pending') {
    if (now === 'approved') return 'approved';
    if (now === 'rejected') return 'rejected';
  }
  return null;
}

function cut(text: string, max = MAX_BODY): string {
  const chars = Array.from(text);
  return chars.length <= max
    ? text
    : `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`;
}

const kindWords = (kind: string) => CLEANUP_KIND_WORDS[kind] ?? 'mess';
const near = (spot: string | null) => (spot ? ` near ${spot}` : '');
const embersText = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'Ember' : 'Embers'}`;

/** The message one target gets. */
export function messageFor(target: PushTarget): PushMessage {
  const url = target.role === 'moderator' ? '/review' : `/cleanup/${target.task_id}`;
  let title: string;
  let body: string;
  if (target.role === 'moderator') {
    title = 'New cleanup to review';
    const what = kindWords(target.kind);
    body = `A camper cleaned up ${target.size ? `${target.size} ` : ''}${what}${near(target.spot_name)}. Tap to review it.`;
  } else if (target.role === 'poster') {
    title = 'Your cleanup got cleaned up';
    body =
      `A camper cleaned up the ${kindWords(target.kind)} you posted${near(target.spot_name)}.` +
      (target.embers ? ` You earned ${embersText(target.embers)}.` : '');
  } else if (target.role === 'sent_back') {
    title = 'Cleanup sent back';
    body = target.reason
      ? `A moderator sent back your cleanup${near(target.spot_name)}: "${target.reason}". You can try again.`
      : `A moderator sent back your cleanup${near(target.spot_name)}. You can try again.`;
  } else {
    title = 'Cleanup approved';
    const thanks = `Thanks for leaving ${target.spot_name ?? 'it'} better.`;
    body =
      target.embers == null
        ? thanks
        : target.embers > 0
          ? `${thanks} You earned ${embersText(target.embers)}.`
          : `${thanks} You'd reached today's Embers limit, so this one didn't add any.`;
  }
  return { to: target.token, title, body: cut(body), data: { url }, sound: 'default', channelId: 'cleanups' };
}

/** One message per phone (a phone can only be one camper's). */
export function buildMessages(targets: PushTarget[]): PushMessage[] {
  const seen = new Set<string>();
  const messages: PushMessage[] = [];
  for (const target of targets) {
    if (seen.has(target.token)) continue;
    seen.add(target.token);
    messages.push(messageFor(target));
  }
  return messages;
}

export function batches<T>(items: T[], size = PUSH_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Addresses Expo says no longer reach a phone (the app was deleted, say): forget them. */
export function goneTokens(messages: PushMessage[], tickets: PushTicket[]): string[] {
  return tickets.flatMap((ticket, i) => {
    const message = messages[i];
    return ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' && message ? [message.to] : [];
  });
}
