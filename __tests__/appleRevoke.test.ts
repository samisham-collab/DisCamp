// Disconnecting Sign in with Apple when an account is deleted: the app side
// (src/lib/appleRevoke.ts) and the apple-revoke Edge Function's Apple calls.

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { webcrypto } from 'crypto';

import { revokeAppleSignIn } from '@/lib/appleRevoke';

import {
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  appleSubject,
  base64url,
  clientSecret,
  DEFAULT_CLIENT_ID,
  formBody,
  pemToDer,
  readConfig,
  revokeWithApple,
  type AppleConfig,
} from '../supabase/functions/apple-revoke/apple';
import { fakeBackend, SAM } from '../test/fakeSupabase';

// Deno and phones have Web Crypto built in; Jest's environment may not.
const subtle = webcrypto.subtle;
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

async function makeKey(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as {
    privateKey: CryptoKey;
    publicKey: CryptoKey;
  };
  const der = new Uint8Array(await subtle.exportKey('pkcs8', pair.privateKey));
  const b64 = Buffer.from(der).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`;
  return { pem, publicKey: pair.publicKey };
}

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;

describe('the client secret Apple asks for', () => {
  it('is an ES256 JWT for DisCamp, signed with the key, good for five minutes', async () => {
    const { pem, publicKey } = await makeKey();
    const config: AppleConfig = {
      teamId: 'TEAM123456',
      keyId: 'KEY1234567',
      privateKey: pem,
      clientId: 'org.discamp.app',
    };
    const jwt = await clientSecret(config, 1_800_000_000);
    const [header, claims, signature] = jwt.split('.') as [string, string, string];
    expect(decode(header)).toEqual({ alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });
    expect(decode(claims)).toEqual({
      iss: 'TEAM123456',
      iat: 1_800_000_000,
      exp: 1_800_000_300,
      aud: 'https://appleid.apple.com',
      sub: 'org.discamp.app',
    });
    const valid = await subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      Buffer.from(signature, 'base64url'),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });

  it('reads its settings, and names any that are missing', () => {
    const env = (values: Record<string, string>) => (name: string) => values[name] ?? '';
    expect(readConfig(env({}))).toEqual({ missing: ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'] });
    expect(readConfig(env({ APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K', APPLE_PRIVATE_KEY: 'a\\nb' }))).toEqual({
      teamId: 'T',
      keyId: 'K',
      privateKey: 'a\nb',
      clientId: DEFAULT_CLIENT_ID,
    });
    expect(
      readConfig(env({ APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K', APPLE_PRIVATE_KEY: 'p', APPLE_CLIENT_ID: 'x.y' })),
    ).toMatchObject({ clientId: 'x.y' });
  });

  it('encodes the way JWTs and Apple expect', () => {
    expect(base64url('hi?>')).toBe('aGk_Pg');
    expect(base64url(new Uint8Array([251, 255]))).toBe('-_8');
    expect(Array.from(pemToDer('-----BEGIN PRIVATE KEY-----\nAQID\n-----END PRIVATE KEY-----'))).toEqual([1, 2, 3]);
    expect(formBody({ a: 'b c', 'd&': '=' })).toBe('a=b%20c&d%26=%3D');
  });
});

describe('asking Apple to revoke', () => {
  type Call = { url: string; body: URLSearchParams };
  let config: AppleConfig;

  beforeEach(async () => {
    config = {
      teamId: 'TEAM123456',
      keyId: 'KEY1234567',
      privateKey: (await makeKey()).pem,
      clientId: 'org.discamp.app',
    };
  });

  const ME = '001234.0a1b2c3d4e5f.1234';
  const idToken = (sub: string) => `header.${base64url(JSON.stringify({ iss: 'https://appleid.apple.com', sub }))}.sig`;

  function apple(answers: { ok: boolean; status?: number; json?: unknown; text?: string }[]) {
    const calls: Call[] = [];
    const doFetch = jest.fn(async (url: string, init: { body: string }) => {
      calls.push({ url, body: new URLSearchParams(init.body) });
      const a = answers.shift()!;
      return {
        ok: a.ok,
        status: a.status ?? (a.ok ? 200 : 400),
        json: async () => a.json,
        text: async () => a.text ?? '',
      };
    });
    return { calls, doFetch };
  }

  it('trades the code for a refresh token, then revokes it', async () => {
    const { calls, doFetch } = apple([
      { ok: true, json: { refresh_token: 'r-1', access_token: 'a-1', id_token: idToken(ME) } },
      { ok: true },
    ]);
    expect(await revokeWithApple('code-1', config, doFetch, ['other', ME])).toEqual({ ok: true });
    expect(calls.map((c) => c.url)).toEqual([APPLE_TOKEN_URL, APPLE_REVOKE_URL]);
    expect(Object.fromEntries(calls[0]!.body)).toMatchObject({
      client_id: 'org.discamp.app',
      code: 'code-1',
      grant_type: 'authorization_code',
    });
    expect(calls[0]!.body.get('client_secret')).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(Object.fromEntries(calls[1]!.body)).toMatchObject({ token: 'r-1', token_type_hint: 'refresh_token' });
  });

  it('revokes the access token when Apple sends no refresh token', async () => {
    const { calls, doFetch } = apple([
      { ok: true, json: { access_token: 'a-1', id_token: idToken(ME) } },
      { ok: true },
    ]);
    expect(await revokeWithApple('code-1', config, doFetch, [ME])).toEqual({ ok: true });
    expect(Object.fromEntries(calls[1]!.body)).toMatchObject({ token: 'a-1', token_type_hint: 'access_token' });
  });

  it('never revokes a different Apple ID than the account’s', async () => {
    let { calls, doFetch } = apple([{ ok: true, json: { refresh_token: 'r', id_token: idToken('someone-else') } }]);
    expect(await revokeWithApple('c', config, doFetch, [ME])).toMatchObject({ ok: false, step: 'match' });
    expect(calls.map((c) => c.url)).toEqual([APPLE_TOKEN_URL]);
    ({ calls, doFetch } = apple([{ ok: true, json: { refresh_token: 'r', id_token: 'not-a-jwt' } }]));
    expect(await revokeWithApple('c', config, doFetch, [ME])).toMatchObject({ ok: false, step: 'match' });
    ({ calls, doFetch } = apple([{ ok: true, json: { refresh_token: 'r', id_token: idToken(ME) } }]));
    expect(await revokeWithApple('c', config, doFetch, [])).toMatchObject({ ok: false, step: 'match' });
    expect(appleSubject(`a.${base64url('{"sub":42}')}.b`)).toBeNull();
    expect(appleSubject('a.%%%.b')).toBeNull();
    expect(appleSubject(null)).toBeNull();
    expect(appleSubject(idToken(ME))).toBe(ME);
  });

  it('says which step Apple refused', async () => {
    let { doFetch } = apple([{ ok: false, status: 400, text: '{"error":"invalid_grant"}' }]);
    expect(await revokeWithApple('old', config, doFetch, [ME])).toEqual({
      ok: false,
      step: 'token',
      status: 400,
      detail: '{"error":"invalid_grant"}',
    });
    ({ doFetch } = apple([{ ok: true, json: {} }]));
    expect(await revokeWithApple('c', config, doFetch, [ME])).toMatchObject({ ok: false, step: 'token' });
    ({ doFetch } = apple([
      { ok: true, json: { refresh_token: 'r', id_token: idToken(ME) } },
      { ok: false, status: 503, text: 'down' },
    ]));
    expect(await revokeWithApple('c', config, doFetch, [ME])).toMatchObject({ ok: false, step: 'revoke', status: 503 });
    ({ doFetch } = apple([]));
    expect(await revokeWithApple('c', { ...config, privateKey: 'not a key' }, doFetch, [ME])).toMatchObject({
      ok: false,
      step: 'secret',
    });
    expect(doFetch).not.toHaveBeenCalled();
  });
});

describe('the app before deleting an Apple account', () => {
  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const signedIn = () => {
    const backend = fakeBackend();
    backend.auth.setUser({ ...SAM, provider: 'apple' });
    return backend;
  };

  it('gets a code from Apple’s sheet and has the server disconnect Apple', async () => {
    const backend = signedIn();
    expect(await revokeAppleSignIn(backend.client)).toBe('revoked');
    expect(AppleAuthentication.signInAsync).toHaveBeenCalledWith({ requestedScopes: [] });
    expect(backend.invoke).toHaveBeenCalledWith(
      'apple-revoke',
      expect.objectContaining({ body: { code: 'apple-one-time-code' } }),
    );
  });

  it('knows when the camper closed Apple’s sheet', async () => {
    const backend = signedIn();
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockRejectedValueOnce(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
    expect(await revokeAppleSignIn(backend.client)).toBe('cancelled');
    expect(backend.invoke).not.toHaveBeenCalled();
  });

  it('fails softly: no code, Apple trouble, the server says no, or it can’t be reached', async () => {
    const backend = signedIn();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.mocked(AppleAuthentication.signInAsync).mockResolvedValueOnce({
      user: 'apple-user',
      identityToken: 'token',
      authorizationCode: null,
      fullName: null,
      email: null,
    } as never);
    expect(await revokeAppleSignIn(backend.client)).toBe('failed');
    jest.mocked(AppleAuthentication.signInAsync).mockRejectedValueOnce(new Error('Apple is down'));
    expect(await revokeAppleSignIn(backend.client)).toBe('failed');
    backend.invoke.mockResolvedValueOnce({ data: { revoked: false, reason: 'not_configured' }, error: null });
    expect(await revokeAppleSignIn(backend.client)).toBe('failed');
    backend.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Function not found' } });
    expect(await revokeAppleSignIn(backend.client)).toBe('failed');
  });

  it('needs the iPhone’s Apple sheet', async () => {
    const backend = signedIn();
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(await revokeAppleSignIn(backend.client)).toBe('unavailable');
    jest.replaceProperty(Platform, 'OS', 'ios');
    jest.mocked(AppleAuthentication.isAvailableAsync).mockResolvedValueOnce(false);
    expect(await revokeAppleSignIn(backend.client)).toBe('unavailable');
    expect(backend.invoke).not.toHaveBeenCalled();
  });
});
