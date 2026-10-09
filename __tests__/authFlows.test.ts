import { afterEach, describe, expect, it, jest } from '@jest/globals';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import {
  authRedirectUrl,
  canUseNativeApple,
  completeSignInFromUrl,
  exchangeCode,
  friendlyAuthError,
  isAuthCallback,
  parseAuthCallback,
  signInWith,
  signInWithBrowser,
} from '@/lib/authFlows';

import { fakeBackend, SAM } from '../test/fakeSupabase';

/** An Apple answer with only the fields DisCamp reads. */
const appleAnswer = (identityToken: string | null) =>
  ({
    user: 'u',
    identityToken,
    fullName: null,
    email: null,
    state: null,
    authorizationCode: null,
    realUserStatus: 1,
  }) as unknown as AppleAuthentication.AppleAuthenticationCredential;

const silence = (level: 'warn' | 'error') => jest.spyOn(console, level).mockImplementation(() => undefined);

describe('sign-in links', () => {
  it('recognizes the redirect in every form it arrives in', () => {
    expect(isAuthCallback('discamp://auth/callback?code=abc')).toBe(true);
    expect(isAuthCallback('exp://192.168.1.5:8081/--/auth/callback?code=abc')).toBe(true);
    expect(isAuthCallback('/auth/callback#error=access_denied')).toBe(true);
    expect(isAuthCallback('auth/callback')).toBe(true);
    expect(isAuthCallback('/spot/smoky-gardens')).toBe(false);
    expect(isAuthCallback('https://x.supabase.co/auth/v1/callback')).toBe(false);
    expect(isAuthCallback('/auth/callbacks')).toBe(false);
  });

  it('reads the code or error from the query or the fragment', () => {
    expect(parseAuthCallback('discamp://auth/callback?code=abc123')).toEqual({ code: 'abc123', error: null });
    expect(parseAuthCallback('discamp://auth/callback#code=abc&state=x')).toEqual({ code: 'abc', error: null });
    expect(parseAuthCallback('discamp://auth/callback?error=access_denied&error_description=User+said+no%21')).toEqual({
      code: null,
      error: 'User said no!',
    });
    expect(parseAuthCallback('discamp://auth/callback?error=server_error')).toEqual({
      code: null,
      error: 'server_error',
    });
    expect(parseAuthCallback('discamp://auth/callback?code=%E0%A4%A&flag')).toEqual({ code: '%E0%A4%A', error: null });
    expect(parseAuthCallback('discamp://auth/callback')).toEqual({ code: null, error: null });
  });

  it('builds the redirect from the app scheme, with a fallback', () => {
    expect(authRedirectUrl()).toBe('discamp://auth/callback');
    const warn = silence('warn');
    jest.mocked(Linking.createURL).mockImplementationOnce(() => {
      throw new Error('no manifest');
    });
    expect(authRedirectUrl()).toBe('discamp://auth/callback');
    expect(warn).toHaveBeenCalled();
  });

  it('turns provider and server errors into plain messages', () => {
    expect(friendlyAuthError(new Error('Network request failed'))).toMatch(/offline/);
    expect(friendlyAuthError({ message: 'Unsupported provider: provider is not enabled' }, 'azure')).toBe(
      "Sign-in with Microsoft isn't set up on the DisCamp server yet.",
    );
    expect(friendlyAuthError({ message: 'invalid flow state, no valid flow state found' })).toMatch(/expired/);
    expect(friendlyAuthError(null)).toBe("Sign-in didn't work. Please try again.");
    expect(friendlyAuthError('boom')).toBe("Sign-in didn't work. Please try again.");
  });
});

describe('browser sign-in (Google, Microsoft, GitHub)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens the provider in a sign-in sheet and trades the code for a session', async () => {
    const backend = fakeBackend();
    const result = await signInWithBrowser(backend.client, 'google');
    expect(result).toEqual({ status: 'signed-in' });
    expect(backend.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'discamp://auth/callback', skipBrowserRedirect: true },
    });
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://auth.example.test/authorize?provider=google',
      'discamp://auth/callback',
    );
    expect(backend.auth.userId).toBe(SAM.id);
  });

  it('asks Microsoft for the email address Supabase needs', async () => {
    const backend = fakeBackend();
    await signInWithBrowser(backend.client, 'azure');
    expect(backend.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'azure',
      options: { redirectTo: 'discamp://auth/callback', skipBrowserRedirect: true, scopes: 'email' },
    });
  });

  it('treats closing the sheet, or saying no, as cancelled', async () => {
    const backend = fakeBackend();
    jest
      .mocked(WebBrowser.openAuthSessionAsync)
      .mockResolvedValueOnce({ type: WebBrowser.WebBrowserResultType.CANCEL });
    expect(await signInWithBrowser(backend.client, 'github')).toEqual({ status: 'cancelled' });
    jest
      .mocked(WebBrowser.openAuthSessionAsync)
      .mockResolvedValueOnce({ type: 'success', url: 'discamp://auth/callback?error=access_denied' });
    expect(await signInWithBrowser(backend.client, 'github')).toEqual({ status: 'cancelled' });
    expect(backend.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('explains a provider that isn’t switched on in Supabase', async () => {
    const warn = silence('warn');
    const backend = fakeBackend();
    backend.auth.signInWithOAuth.mockResolvedValueOnce({
      data: { provider: 'github', url: '' },
      error: { message: 'Unsupported provider: provider is not enabled' },
    });
    expect(await signInWithBrowser(backend.client, 'github')).toEqual({
      status: 'error',
      message: "Sign-in with GitHub isn't set up on the DisCamp server yet.",
    });
    expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('reports a redirect with an error or no code', async () => {
    const warn = silence('warn');
    const backend = fakeBackend();
    jest
      .mocked(WebBrowser.openAuthSessionAsync)
      .mockResolvedValueOnce({ type: 'success', url: 'discamp://auth/callback?error=server_error' });
    expect(await signInWithBrowser(backend.client, 'google')).toEqual({
      status: 'error',
      message: "Sign-in didn't work. Please try again.",
    });
    jest
      .mocked(WebBrowser.openAuthSessionAsync)
      .mockResolvedValueOnce({ type: 'success', url: 'discamp://auth/callback' });
    expect(await signInWithBrowser(backend.client, 'google')).toEqual({
      status: 'error',
      message: "Sign-in didn't finish. Please try again.",
    });
    expect(warn).toHaveBeenCalled();
  });

  it('trades each code only once, even when two paths deliver it', async () => {
    const backend = fakeBackend();
    const [a, b] = await Promise.all([
      completeSignInFromUrl(backend.client, 'discamp://auth/callback?code=good-once'),
      completeSignInFromUrl(backend.client, '/auth/callback?code=good-once'),
    ]);
    expect(a).toEqual({ status: 'signed-in' });
    expect(b).toEqual({ status: 'signed-in' });
    expect(backend.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it('explains an expired or failed code', async () => {
    const warn = silence('warn');
    const backend = fakeBackend();
    expect(await exchangeCode(backend.client, 'bad-code')).toEqual({
      status: 'error',
      message: 'That sign-in link expired. Please try again.',
    });
    backend.auth.exchangeCodeForSession.mockRejectedValueOnce(new Error('Network request failed'));
    expect(await exchangeCode(backend.client, 'good-but-offline')).toEqual({
      status: 'error',
      message: "You're offline or the server can't be reached. Try again when you have signal.",
    });
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('Sign in with Apple', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the built-in sheet on iPhone, with a hashed nonce', async () => {
    const backend = fakeBackend();
    expect(await signInWith(backend.client, 'apple')).toEqual({ status: 'signed-in' });
    const rawNonce = jest.mocked(Crypto.randomUUID).mock.results[0]?.value as string;
    expect(rawNonce).toMatch(/^[0-9a-f-]{36}$/);
    expect(AppleAuthentication.signInAsync).toHaveBeenCalledWith({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: `sha256(${rawNonce})`,
    });
    expect(backend.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-identity-token',
      nonce: rawNonce,
    });
    expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it("keeps the name Apple shares only on the first sign-in, unless one's already picked", async () => {
    const backend = fakeBackend();
    backend.auth.nextUser = { ...SAM, displayName: 'Camper' };
    await signInWith(backend.client, 'apple');
    expect(backend.auth.updateUser).toHaveBeenCalledWith({
      data: { given_name: 'Sam', family_name: 'Isham', full_name: 'Sam Isham' },
    });
    expect(backend.profiles.get(SAM.id)).toBe('Sam');
    const [update] = backend.writes('profiles', 'update');
    expect(update?.filters).toEqual([
      ['id', SAM.id],
      ['display_name', 'Camper'],
    ]);
  });

  it('skips the name when Apple shares none, and survives failing to save it', async () => {
    const warn = silence('warn');
    const backend = fakeBackend();
    jest.mocked(AppleAuthentication.signInAsync).mockResolvedValueOnce(appleAnswer('token'));
    expect(await signInWith(backend.client, 'apple')).toEqual({ status: 'signed-in' });
    expect(backend.auth.updateUser).not.toHaveBeenCalled();

    backend.auth.updateUser.mockRejectedValueOnce(new Error('Network request failed'));
    expect(await signInWith(backend.client, 'apple')).toEqual({ status: 'signed-in' });
    expect(warn).toHaveBeenCalledWith('[DisCamp] Could not save the name Apple shared', expect.anything());
  });

  it('treats closing the Apple sheet as cancelled', async () => {
    const backend = fakeBackend();
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockRejectedValueOnce(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
    expect(await signInWith(backend.client, 'apple')).toEqual({ status: 'cancelled' });
    expect(backend.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('reports Apple and Supabase failures', async () => {
    const warn = silence('warn');
    const backend = fakeBackend();
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockRejectedValueOnce(new Error('The operation couldn’t be completed'));
    expect(await signInWith(backend.client, 'apple')).toEqual({
      status: 'error',
      message: "Sign in with Apple didn't work. Please try again.",
    });
    jest.mocked(AppleAuthentication.signInAsync).mockResolvedValueOnce(appleAnswer(null));
    expect(await signInWith(backend.client, 'apple')).toEqual({
      status: 'error',
      message: "Sign in with Apple didn't work. Please try again.",
    });
    backend.auth.signInWithIdToken.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'Unsupported provider: provider is not enabled' },
    });
    expect(await signInWith(backend.client, 'apple')).toEqual({
      status: 'error',
      message: "Sign-in with Apple isn't set up on the DisCamp server yet.",
    });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('uses the browser on Android, or when the sheet is unavailable', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(await canUseNativeApple()).toBe(false);
    const backend = fakeBackend();
    expect(await signInWith(backend.client, 'apple')).toEqual({ status: 'signed-in' });
    expect(backend.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'apple' }));

    jest.replaceProperty(Platform, 'OS', 'ios');
    jest.mocked(AppleAuthentication.isAvailableAsync).mockRejectedValueOnce(new Error('old iOS'));
    expect(await canUseNativeApple()).toBe(false);
  });

  it('never throws, whatever goes wrong', async () => {
    const error = silence('error');
    const backend = fakeBackend();
    backend.auth.signInWithOAuth.mockRejectedValueOnce(new Error('Network request failed'));
    expect(await signInWith(backend.client, 'google')).toEqual({
      status: 'error',
      message: "You're offline or the server can't be reached. Try again when you have signal.",
    });
    expect(error).toHaveBeenCalled();
  });
});
