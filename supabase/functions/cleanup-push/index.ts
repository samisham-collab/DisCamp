// Supabase Edge Function: sends the phone notifications for cleanups through
// Expo's push service. A Database Webhook on public.cleanup_completions
// (inserts and updates) calls it; setup in MODERATION.md.
//
//   sent for review   → moderators: "New cleanup to review"
//   approved          → the camper who cleaned it up (with their Embers), and
//                       the camper who posted it, if someone else
//   sent back         → the camper who cleaned it up, with the reason
//
// Who to tell comes from public.cleanup_push_targets() (migration 0009), which
// only the service role may call. Addresses Expo says are gone are forgotten.
//
// Secrets (Supabase dashboard > Edge Functions > Secrets):
//   PUSH_WEBHOOK_SECRET  optional: the webhook sends it in the
//                        x-discamp-secret header. Without it, the function
//                        uses REPORT_WEBHOOK_SECRET (the same one as
//                        report-alert), so one secret covers both.
//   EXPO_ACCESS_TOKEN    optional: only if you turn on "Enhanced Security for
//                        Push Notifications" on expo.dev
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import {
  batches,
  buildMessages,
  eventFor,
  goneTokens,
  type PushTarget,
  type PushTicket,
  type WebhookPayload,
} from './message.ts';

const env = (name: string) => Deno.env.get(name)?.trim() ?? '';

/** Constant-time comparison, so the secret can't be guessed by timing. */
function sameSecret(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Supabase answered ${res.status} for ${name}`);
  return (await res.json()) as T;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = env('PUSH_WEBHOOK_SECRET') || env('REPORT_WEBHOOK_SECRET');
  if (!sameSecret(secret, req.headers.get('x-discamp-secret') ?? '')) {
    return new Response('Forbidden', { status: 403 });
  }
  const payload = (await req.json().catch(() => null)) as WebhookPayload | null;
  const event = eventFor(payload);
  if (!event || !payload?.record) return new Response('Ignored', { status: 200 });

  let targets: PushTarget[];
  try {
    targets = await rpc<PushTarget[]>('cleanup_push_targets', { completion: payload.record.id, what: event });
  } catch (error) {
    console.error('Could not look up who to tell', String(error));
    return new Response('Lookup failed', { status: 502 });
  }
  const messages = buildMessages(targets);
  if (messages.length === 0) return new Response('Nobody to tell', { status: 200 });

  const token = env('EXPO_ACCESS_TOKEN');
  const gone: string[] = [];
  let failed = false;
  for (const batch of batches(messages)) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      failed = true;
      console.error('Expo refused the notifications', res.status, await res.text());
      continue;
    }
    const { data } = (await res.json()) as { data?: PushTicket[] };
    gone.push(...goneTokens(batch, data ?? []));
  }
  if (gone.length > 0) {
    await rpc('forget_push_tokens', { tokens: gone }).catch((error: unknown) => {
      console.error('Could not forget old push addresses', String(error));
    });
  }
  return failed ? new Response('Some notifications failed', { status: 502 }) : new Response('Sent', { status: 200 });
});
