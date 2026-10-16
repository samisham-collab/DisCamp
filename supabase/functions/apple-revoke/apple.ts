// Talking to Apple for apple-revoke: the signed "client secret" Apple asks
// for, and the two calls that turn a one-time authorization code into a
// token and revoke it. Plain functions only (Web Crypto and fetch, which Deno
// and Node both have), so the app's test suite can check them; index.ts
// handles the request.
//
// Apple's docs: "Generate and validate tokens" and "Revoke tokens"
// (developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_rest_api).

export interface AppleConfig {
  /** The 10-character Team ID from developer.apple.com > Membership. */
  teamId: string;
  /** The 10-character Key ID of the Sign in with Apple key (.p8). */
  keyId: string;
  /** The .p8 key's contents, -----BEGIN PRIVATE KEY----- and all. */
  privateKey: string;
  /** Who the code was issued to: the app's bundle ID for the iPhone sheet. */
  clientId: string;
}

export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
/** DisCamp's bundle ID (app.json), which codes from the iPhone's Apple sheet are issued to. */
export const DEFAULT_CLIENT_ID = 'org.discamp.app';

/** The settings, or the names of the ones that are missing. */
export function readConfig(get: (name: string) => string): AppleConfig | { missing: string[] } {
  const teamId = get('APPLE_TEAM_ID');
  const keyId = get('APPLE_KEY_ID');
  // Pasted keys sometimes arrive with "\n" written out instead of new lines.
  const privateKey = get('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const clientId = get('APPLE_CLIENT_ID') || DEFAULT_CLIENT_ID;
  const missing = [
    ...(teamId ? [] : ['APPLE_TEAM_ID']),
    ...(keyId ? [] : ['APPLE_KEY_ID']),
    ...(privateKey ? [] : ['APPLE_PRIVATE_KEY']),
  ];
  return missing.length > 0 ? { missing } : { teamId, keyId, privateKey, clientId };
}

export function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The DER bytes inside a PEM key. */
export function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----(BEGIN|END) [A-Z ]+-----/g, '').replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The client secret: a JWT signed with the .p8 key (ES256), good for five
 * minutes, which is plenty for one request.
 */
export async function clientSecret(config: AppleConfig, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = { alg: 'ES256', kid: config.keyId, typ: 'JWT' };
  const claims = {
    iss: config.teamId,
    iat: nowSeconds,
    exp: nowSeconds + 300,
    aud: 'https://appleid.apple.com',
    sub: config.clientId,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(config.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // Web Crypto signs ECDSA in the raw r‖s form that JWTs use.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

export function formBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export type RevokeOutcome =
  { ok: true } | { ok: false; step: 'secret' | 'token' | 'match' | 'revoke'; status?: number; detail: string };

/** Who an Apple id_token is about (its `sub`), or null if it can't be read. */
export function appleSubject(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  const payload = idToken.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))) as { sub?: unknown };
    return typeof json.sub === 'string' && json.sub ? json.sub : null;
  } catch {
    return null;
  }
}

type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

/**
 * Trades the one-time code for a token, then asks Apple to revoke it, but
 * only when the code is for the camper's own Apple ID (`appleIds`, from their
 * DisCamp account): a phone signed in to someone else's Apple ID would
 * otherwise disconnect theirs.
 */
export async function revokeWithApple(
  code: string,
  config: AppleConfig,
  doFetch: Fetch,
  appleIds: readonly string[],
): Promise<RevokeOutcome> {
  let secret: string;
  try {
    secret = await clientSecret(config);
  } catch (error) {
    return { ok: false, step: 'secret', detail: `The Apple key didn't load: ${String(error)}` };
  }
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

  const tokenRes = await doFetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers,
    body: formBody({
      client_id: config.clientId,
      client_secret: secret,
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return { ok: false, step: 'token', status: tokenRes.status, detail: await tokenRes.text() };
  const tokens = (await tokenRes.json()) as { refresh_token?: unknown; access_token?: unknown; id_token?: unknown };
  const refresh = typeof tokens.refresh_token === 'string' ? tokens.refresh_token : null;
  const access = typeof tokens.access_token === 'string' ? tokens.access_token : null;
  if (!refresh && !access) return { ok: false, step: 'token', detail: 'Apple sent no token' };
  const subject = appleSubject(tokens.id_token);
  if (!subject || !appleIds.includes(subject)) {
    return { ok: false, step: 'match', detail: 'The code is for a different Apple ID than this account' };
  }

  const revokeRes = await doFetch(APPLE_REVOKE_URL, {
    method: 'POST',
    headers,
    body: formBody({
      client_id: config.clientId,
      client_secret: secret,
      token: (refresh ?? access) as string,
      token_type_hint: refresh ? 'refresh_token' : 'access_token',
    }),
  });
  if (!revokeRes.ok) return { ok: false, step: 'revoke', status: revokeRes.status, detail: await revokeRes.text() };
  return { ok: true };
}
