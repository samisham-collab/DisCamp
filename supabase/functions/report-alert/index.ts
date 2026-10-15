// Supabase Edge Function: emails you each new report (a spot, a photo, a
// check-in, a cleanup or a name), so you can act within the 24 hours App Review expects. A Database
// Webhook on inserts into public.flags calls it (setup in MODERATION.md). Email goes out through
// Resend's API.
//
// Secrets (Supabase dashboard > Edge Functions > Secrets):
//   REPORT_WEBHOOK_SECRET  any long random string; the webhook sends it in
//                          the x-discamp-secret header
//   RESEND_API_KEY         from resend.com
//   MODERATION_EMAIL       where reports go (your inbox)
//   REPORT_FROM_EMAIL      optional sender, default "DisCamp <onboarding@resend.dev>"
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { buildAlert, type FlagContext, type FlagRecord } from './message.ts';

const env = (name: string) => Deno.env.get(name)?.trim() ?? '';

/** Constant-time comparison, so the secret can't be guessed by timing. */
function sameSecret(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function rest<T>(path: string): Promise<T> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Supabase answered ${res.status} for ${path.split('?')[0]}`);
  return (await res.json()) as T;
}

async function lookUp(flag: FlagRecord): Promise<FlagContext> {
  const eq = (value: string) => `eq.${encodeURIComponent(value)}`;
  let spotName: string | null = null;
  let camperId = flag.camper_id;
  let hidden = false;
  let photoUrl: string | null = null;
  let checkinKind: string | null = null;
  let checkinNote: string | null = null;
  let taskKind: string | null = null;
  let taskNote: string | null = null;
  if (flag.task_id) {
    const [task] = await rest<
      {
        spot_id: string | null;
        before_path: string;
        created_by: string | null;
        kind: string;
        note: string | null;
        hidden_at: string | null;
      }[]
    >(`cleanup_tasks?select=spot_id,before_path,created_by,kind,note,hidden_at&id=${eq(flag.task_id)}`);
    if (task) {
      if (task.spot_id) {
        const [spot] = await rest<{ name: string }[]>(`spots?select=name&id=${eq(task.spot_id)}`);
        spotName = spot?.name ?? null;
      }
      photoUrl = `${env('SUPABASE_URL')}/storage/v1/object/public/spot-photos/${task.before_path}`;
      taskKind = task.kind;
      taskNote = task.note;
    }
    camperId = task?.created_by ?? null;
    hidden = task?.hidden_at != null;
  } else if (flag.checkin_id != null) {
    const [checkin] = await rest<
      { spot_id: string; camper_id: string | null; kind: string; note: string | null; hidden_at: string | null }[]
    >(`checkins?select=spot_id,camper_id,kind,note,hidden_at&id=${eq(String(flag.checkin_id))}`);
    if (checkin) {
      const [spot] = await rest<{ name: string }[]>(`spots?select=name&id=${eq(checkin.spot_id)}`);
      spotName = spot?.name ?? null;
      checkinKind = checkin.kind;
      checkinNote = checkin.note;
    }
    camperId = checkin?.camper_id ?? null;
    hidden = checkin?.hidden_at != null;
  } else if (flag.photo_id) {
    const [photo] = await rest<
      { spot_id: string; path: string; created_by: string | null; hidden_at: string | null }[]
    >(`spot_photos?select=spot_id,path,created_by,hidden_at&id=${eq(flag.photo_id)}`);
    if (photo) {
      const [spot] = await rest<{ name: string }[]>(`spots?select=name&id=${eq(photo.spot_id)}`);
      spotName = spot?.name ?? null;
      photoUrl = `${env('SUPABASE_URL')}/storage/v1/object/public/spot-photos/${photo.path}`;
    }
    camperId = photo?.created_by ?? null;
    hidden = photo?.hidden_at != null;
  } else if (flag.spot_id) {
    const [spot] = await rest<{ name: string; created_by: string | null; hidden_at: string | null }[]>(
      `spots?select=name,created_by,hidden_at&id=${eq(flag.spot_id)}`,
    );
    spotName = spot?.name ?? null;
    camperId = spot?.created_by ?? null;
    hidden = spot?.hidden_at != null;
  }
  let camperName: string | null = null;
  if (camperId) {
    const [profile] = await rest<{ display_name: string }[]>(`profiles?select=display_name&id=${eq(camperId)}`);
    camperName = profile?.display_name ?? null;
  }
  // Who counts toward hiding it, the same way as moderation.open_reporters:
  // campers with an open report, minus any whose earlier report was dismissed.
  const target = flag.task_id
    ? `task_id=${eq(flag.task_id)}`
    : flag.photo_id
      ? `photo_id=${eq(flag.photo_id)}`
      : flag.checkin_id != null
        ? `checkin_id=${eq(String(flag.checkin_id))}`
        : flag.spot_id
          ? `spot_id=${eq(flag.spot_id)}`
          : `camper_id=${eq(flag.camper_id ?? '')}`;
  const flags = await rest<{ reporter_id: string | null; status: string }[]>(
    `flags?select=reporter_id,status&status=in.(open,dismissed)&${target}`,
  );
  const dismissed = new Set(flags.filter((f) => f.status === 'dismissed').map((f) => f.reporter_id));
  const reporters = new Set(
    flags
      .filter((f) => f.status === 'open' && f.reporter_id && !dismissed.has(f.reporter_id))
      .map((f) => f.reporter_id),
  ).size;
  return { spotName, camperId, camperName, reporters, hidden, photoUrl, checkinKind, checkinNote, taskKind, taskNote };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!sameSecret(env('REPORT_WEBHOOK_SECRET'), req.headers.get('x-discamp-secret') ?? '')) {
    return new Response('Forbidden', { status: 403 });
  }
  const payload = (await req.json().catch(() => null)) as { type?: string; table?: string; record?: FlagRecord } | null;
  if (payload?.type !== 'INSERT' || payload.table !== 'flags' || !payload.record) {
    return new Response('Ignored', { status: 200 });
  }

  let context: FlagContext;
  try {
    context = await lookUp(payload.record);
  } catch (error) {
    // Still send what we have: a report must never go unseen.
    console.error('Could not look up the report', String(error));
    context = { spotName: null, camperId: payload.record.camper_id, camperName: null, reporters: 1, hidden: false };
  }

  const { subject, text } = buildAlert(payload.record, context);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env('REPORT_FROM_EMAIL') || 'DisCamp <onboarding@resend.dev>',
      to: [env('MODERATION_EMAIL')],
      subject,
      text,
    }),
  });
  if (!res.ok) {
    console.error('Resend refused the email', res.status, await res.text());
    return new Response('Email failed', { status: 502 });
  }
  return new Response('Sent', { status: 200 });
});
