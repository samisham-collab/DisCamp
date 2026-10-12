import { afterEach, describe, expect, it, jest } from '@jest/globals';
import * as Sentry from '@sentry/react-native';
import { ExecutionEnvironment } from 'expo-constants';

import {
  initCrashReports,
  noteForReports,
  redact,
  reportError,
  resetCrashReportsForTests,
  scrubBreadcrumb,
  scrubEvent,
  stripQuery,
} from '@/lib/crashReports';
import { log } from '@/lib/log';

const DSN = 'https://key@o1.ingest.sentry.io/2';
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';

describe('scrubbing reports', () => {
  it('blanks emails, tokens, sign-in codes and account ids', () => {
    expect(redact(`Hi sam@example.com, Bearer abc.def and ${JWT}`)).toBe('Hi [email], [token] and [token]');
    expect(redact(`discamp://auth/callback?code=secret123&state=xyz#access_token=t0k`)).toBe(
      'discamp://auth/callback?code=[redacted]&state=[redacted]#access_token=[redacted]',
    );
    expect(redact(`profile ${ACCOUNT} failed`)).toBe('profile [id] failed');
    expect(redact('Nothing to hide')).toBe('Nothing to hide');
  });

  it('drops query strings from links', () => {
    expect(stripQuery('https://x.supabase.co/rest/v1/profiles?id=eq.1')).toBe('https://x.supabase.co/rest/v1/profiles');
    expect(stripQuery('discamp://auth/callback#code=1')).toBe('discamp://auth/callback');
  });

  it('cleans breadcrumbs', () => {
    expect(
      scrubBreadcrumb({
        category: 'fetch',
        message: 'sent to sam@example.com',
        data: { url: 'https://x.supabase.co/auth/v1/token?grant_type=pkce', access_token: 'abc', status_code: 200 },
      }),
    ).toEqual({
      category: 'fetch',
      message: 'sent to [email]',
      data: { url: 'https://x.supabase.co/auth/v1/token', access_token: '[redacted]', status_code: 200 },
    });
    expect(scrubBreadcrumb({ category: 'navigation', data: { from: '/a?code=1', to: '/b' } })).toEqual({
      category: 'navigation',
      data: { from: '/a', to: '/b' },
    });
    expect(scrubBreadcrumb({ category: 'ui.click' })).toEqual({ category: 'ui.click' });
  });

  it('removes who the camper is from events', () => {
    const event = scrubEvent({
      type: undefined,
      message: `Failed for ${ACCOUNT}`,
      user: { id: ACCOUNT, email: 'sam@example.com', ip_address: '1.2.3.4' },
      request: { url: 'https://x?code=1' },
      exception: { values: [{ type: 'Error', value: 'Bad token eyJa.eyJb.c' }, { type: 'Error' }] },
      breadcrumbs: [{ message: 'sam@example.com signed in' }],
      extra: { where: 'Saving', nested: { email: 'sam@example.com', list: [`id ${ACCOUNT}`] }, n: 1 },
      contexts: { app: { app_version: '1.4.0' } },
      tags: { screen: 'account' },
    });
    expect(event.user).toBeUndefined();
    expect(event.request).toBeUndefined();
    expect(event.message).toBe('Failed for [id]');
    expect(event.exception?.values).toEqual([{ type: 'Error', value: 'Bad token [token]' }, { type: 'Error' }]);
    expect(event.breadcrumbs).toEqual([{ message: '[email] signed in' }]);
    expect(event.extra).toEqual({ where: 'Saving', nested: { email: '[redacted]', list: ['id [id]'] }, n: 1 });
    expect(event.contexts).toEqual({ app: { app_version: '1.4.0' } });
    expect(event.tags).toEqual({ screen: 'account' });
    expect(scrubEvent({ type: undefined })).toEqual({ type: undefined });
  });

  it('stops at deeply nested data', () => {
    let deep: Record<string, unknown> = { leaf: 'sam@example.com' };
    for (let i = 0; i < 10; i++) deep = { deeper: deep };
    const event = scrubEvent({ type: undefined, extra: deep });
    expect(JSON.stringify(event.extra)).not.toContain('sam@example.com');
    expect(JSON.stringify(event.extra)).toContain('[too deep]');
  });
});

describe('turning crash reports on', () => {
  afterEach(() => {
    resetCrashReportsForTests();
    jest.mocked(Sentry.init).mockClear();
    jest.mocked(Sentry.captureException).mockClear();
    jest.mocked(Sentry.addBreadcrumb).mockClear();
  });

  it('stays off without a DSN, and in Expo Go', () => {
    expect(initCrashReports(undefined, ExecutionEnvironment.Standalone)).toBe(false);
    expect(initCrashReports('  ', ExecutionEnvironment.Standalone)).toBe(false);
    expect(initCrashReports(DSN, ExecutionEnvironment.StoreClient)).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
    reportError(new Error('x'));
    noteForReports('x');
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('starts once in a real build, without personal data or tracing', () => {
    expect(initCrashReports(DSN, ExecutionEnvironment.Standalone)).toBe(true);
    expect(initCrashReports(DSN, ExecutionEnvironment.Standalone)).toBe(true);
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const options = jest.mocked(Sentry.init).mock.calls[0]?.[0];
    expect(options).toMatchObject({
      dsn: DSN,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      attachScreenshot: false,
      attachViewHierarchy: false,
    });
    // Every event and breadcrumb goes through the scrubbers.
    expect(options?.beforeSend?.({ type: undefined, user: { id: 'x' } }, {})).toEqual({ type: undefined });
    expect(options?.beforeBreadcrumb?.({ message: 'a@b.co' }, {})).toEqual({ message: '[email]' });
  });

  it('sends logged errors, with warnings as notes', () => {
    initCrashReports(DSN, ExecutionEnvironment.Bare);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const boom = new Error('boom');
    log.error('Saving failed', boom, { spot: 'x' });
    expect(Sentry.captureException).toHaveBeenLastCalledWith(boom, { extra: { spot: 'x', where: 'Saving failed' } });
    log.error('Odd answer', { message: 'weird' });
    expect(jest.mocked(Sentry.captureException).mock.calls.at(-1)?.[0]).toEqual(
      new Error('Odd answer: {"message":"weird"}'),
    );
    log.error('Just a message');
    expect(jest.mocked(Sentry.captureException).mock.calls.at(-1)?.[0]).toEqual(new Error('Just a message'));
    reportError('plain');
    expect(Sentry.captureException).toHaveBeenLastCalledWith('plain', undefined);
    log.warn('Slow server');
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'discamp',
      level: 'warning',
      message: 'Slow server',
    });
    jest.restoreAllMocks();
  });
});
