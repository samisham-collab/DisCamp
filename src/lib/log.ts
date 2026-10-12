// One place for app logging. It writes to the console and, when crash reports
// are on (src/lib/crashReports.ts), sends errors to Sentry and keeps warnings
// as notes that show alongside the next error.

import { noteForReports, reportError } from './crashReports';

type Context = Record<string, unknown>;

function format(message: string, context?: Context): unknown[] {
  return context ? [`[DisCamp] ${message}`, context] : [`[DisCamp] ${message}`];
}

export const log = {
  /** Expected situations worth a note while developing. Never shown as a warning. */
  info(message: string, context?: Context) {
    // This file is the one place allowed to write to the console.
    // eslint-disable-next-line no-console
    console.info(...format(message, context));
  },
  warn(message: string, context?: Context) {
    console.warn(...format(message, context));
    noteForReports(message);
  },
  error(message: string, error?: unknown, context?: Context) {
    console.error(...format(message, error === undefined ? context : { ...context, error: describeError(error) }));
    reportError(
      error instanceof Error ? error : new Error(error === undefined ? message : `${message}: ${describeError(error)}`),
      {
        ...context,
        where: message,
      },
    );
  },
};

/** A short, readable description of anything that was thrown. Always a string. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  try {
    // JSON.stringify returns undefined (not a string) for undefined, functions and symbols.
    const json = JSON.stringify(error);
    if (typeof json === 'string') return json;
  } catch {
    // Circular objects and BigInts can't be serialized; fall through.
  }
  return String(error);
}
