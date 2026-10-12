// Crash and error reports from campers' phones, through Sentry. Off unless
// EXPO_PUBLIC_SENTRY_DSN is set, and never in Expo Go (it has no Sentry
// native code). Reports carry the error, the phone model and the app
// version, never who the camper is: no account id, email, name, sign-in
// tokens or codes. scrubEvent removes anything like that before sending.

import * as Sentry from '@sentry/react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

type Event = Sentry.ErrorEvent;
type Breadcrumb = Sentry.Breadcrumb;

let enabled = false;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/** JSON web tokens (Supabase sessions) and bearer tokens. */
const TOKEN = /\b(?:eyJ[\w-]+\.[\w-]+\.[\w-]+|bearer\s+[\w.-]+)/gi;
/** Sign-in codes, tokens and similar in links: ?code=…, &access_token=… */
const SECRET_PARAM = /([?&#](?:code|token|access_token|refresh_token|id_token|nonce|state)=)[^&#\s]+/gi;
/** Account ids (UUIDs). Spot ids are UUIDs too; losing them in reports is fine. */
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** Text with emails, tokens, sign-in codes and account ids blanked out. */
export function redact(text: string): string {
  return text
    .replace(EMAIL, '[email]')
    .replace(TOKEN, '[token]')
    .replace(SECRET_PARAM, '$1[redacted]')
    .replace(UUID, '[id]');
}

/** A web address without its query string or fragment, which can hold codes. */
export function stripQuery(url: string): string {
  return redact(url.replace(/[?#].*$/, ''));
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redact(value);
  if (value == null || typeof value !== 'object') return value;
  if (depth > 6) return '[too deep]';
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      /email|token|password|secret|nonce|authorization|cookie|verifier/i.test(k)
        ? '[redacted]'
        : scrubValue(v, depth + 1),
    ]),
  );
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  const data = crumb.data ? (scrubValue(crumb.data) as Record<string, unknown>) : undefined;
  for (const key of ['url', 'from', 'to']) {
    if (data && typeof data[key] === 'string') data[key] = stripQuery(data[key]);
  }
  return {
    ...crumb,
    ...(crumb.message ? { message: redact(crumb.message) } : {}),
    ...(data ? { data } : {}),
  };
}

/** The event with everything that could identify the camper removed. */
export function scrubEvent(event: Event): Event {
  const { user: _user, request: _request, ...rest } = event;
  return {
    ...rest,
    ...(event.message ? { message: redact(event.message) } : {}),
    ...(event.exception
      ? {
          exception: {
            ...event.exception,
            values: event.exception.values?.map((v) => ({ ...v, ...(v.value ? { value: redact(v.value) } : {}) })),
          },
        }
      : {}),
    ...(event.breadcrumbs ? { breadcrumbs: event.breadcrumbs.map(scrubBreadcrumb) } : {}),
    ...(event.extra ? { extra: scrubValue(event.extra) as Event['extra'] } : {}),
    ...(event.contexts ? { contexts: scrubValue(event.contexts) as Event['contexts'] } : {}),
    ...(event.tags ? { tags: scrubValue(event.tags) as Event['tags'] } : {}),
  };
}

/**
 * Starts crash reports if a DSN is set and this isn't Expo Go. Returns
 * whether they're on. Call once, before the app renders.
 */
export function initCrashReports(
  dsn: string | undefined = process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: ExecutionEnvironment = Constants.executionEnvironment,
): boolean {
  if (enabled) return true;
  if (!dsn?.trim() || environment === ExecutionEnvironment.StoreClient) return false;
  Sentry.init({
    dsn: dsn.trim(),
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    // Errors only: no performance tracing, screenshots or view trees.
    tracesSampleRate: 0,
    enableAutoPerformanceTracing: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    maxBreadcrumbs: 50,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
  enabled = true;
  return true;
}

/** Sends an error to Sentry, if crash reports are on. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** A note that shows before the next error, if crash reports are on. */
export function noteForReports(message: string): void {
  if (!enabled) return;
  Sentry.addBreadcrumb({ category: 'discamp', level: 'warning', message });
}

/** For tests. */
export function resetCrashReportsForTests(): void {
  enabled = false;
}
