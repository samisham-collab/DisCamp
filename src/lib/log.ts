// One place for app logging. Today it writes to the console; later it can
// forward warnings and errors to a crash reporter without touching callers.

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
  },
  error(message: string, error?: unknown, context?: Context) {
    console.error(...format(message, error === undefined ? context : { ...context, error: describeError(error) }));
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
