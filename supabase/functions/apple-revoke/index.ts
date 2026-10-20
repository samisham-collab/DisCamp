// Supabase Edge Function: disconnects DisCamp from a camper's Apple ID when
// they delete their account (App Store rule 5.1.1(v), Apple TN3194). The app
// asks Apple for a fresh one-time code, sends it here while the camper is
// still signed in, and then deletes the account. Without this function (or
// its secrets) the app still deletes the account and shows the camper how to
// disconnect Apple in Settings, as before.
//
// Secrets (Supabase dashboard > Edge Functions > Secrets), from
// developer.apple.com > Certificates, Identifiers & Profiles > Keys (a key
// with Sign in with Apple, for the app's App ID):
//   APPLE_TEAM_ID      your Team ID (Membership details)
//   APPLE_KEY_ID       the key's Key ID
//   APPLE_PRIVATE_KEY  the whole .p8 file, BEGIN and END lines included
//   APPLE_CLIENT_ID    optional: the bundle ID in app.json, if it ever differs from com.samuelisham.discamp
// SUPABASE_URL and the API keys are provided by Supabase.
//
// The function checks who's calling itself (it asks Supabase Auth about the
// camper's own sign-in token), so it works with either JWT setting:
//   supabase functions deploy apple-revoke --no-verify-jwt

import { readConfig, revokeWithApple } from './apple.ts';

const env = (name: string) => Deno.env.get(name)?.trim() ?? '';

const answer = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Identity {
  provider?: string;
  id?: string;
  provider_id?: string;
  identity_data?: { sub?: string };
}

/** The signed-in camper, from their own token, with their Apple ID (if any), or null. */
async function camper(req: Request): Promise<{ id: string; providers: string[]; appleIds: string[] } | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, {
    headers: { apikey: env('SUPABASE_ANON_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: auth },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as {
    id?: string;
    app_metadata?: { provider?: string; providers?: string[] };
    identities?: Identity[];
  };
  if (!user.id) return null;
  const providers = [...(user.app_metadata?.providers ?? []), user.app_metadata?.provider ?? ''];
  const appleIds = (user.identities ?? [])
    .filter((i) => i.provider === 'apple')
    .flatMap((i) => [i.identity_data?.sub, i.provider_id, i.id])
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  return { id: user.id, providers, appleIds };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return answer({ revoked: false, reason: 'method' }, 405);
  const who = await camper(req);
  if (!who) return answer({ revoked: false, reason: 'not_signed_in' }, 401);
  if (!who.providers.includes('apple')) return answer({ revoked: false, reason: 'not_apple' }, 400);

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!code || code.length > 2000) return answer({ revoked: false, reason: 'bad_code' }, 400);

  const config = readConfig(env);
  if ('missing' in config) {
    console.error('apple-revoke is missing secrets:', config.missing.join(', '));
    return answer({ revoked: false, reason: 'not_configured' });
  }

  const outcome = await revokeWithApple(code, config, fetch, who.appleIds);
  if (!outcome.ok) {
    console.error('Apple refused', outcome.step, outcome.status ?? '', outcome.detail.slice(0, 300));
    return answer({ revoked: false, reason: 'apple_refused' });
  }
  return answer({ revoked: true });
});
