// Time limits for server requests. Aborting a request isn't always enough:
// supabase-js first waits for a fresh sign-in token, and that wait ignores the
// abort. So the limit also stops *waiting*: the camper hears "took too long"
// on time, and whatever was still running finishes (or fails) unseen.

export class DeadlineError extends Error {
  constructor() {
    super('The time limit passed.');
    this.name = 'DeadlineError';
  }
}

/**
 * Runs `run` with a signal that aborts after `timeoutMs`, and stops waiting
 * for it then. Throws DeadlineError when the time ran out, or whatever `run`
 * threw before that.
 */
export async function withDeadline<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DeadlineError());
    }, timeoutMs);
  });
  const work = run(controller.signal);
  // A late failure after the deadline is expected; don't report it as unhandled.
  work.catch(() => undefined);
  try {
    const result = await Promise.race([work, expired]);
    if (controller.signal.aborted) throw new DeadlineError();
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw new DeadlineError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * fetch with a time limit, for the Supabase client as a whole: sign-in token
 * renewals, signing out and other calls that don't set their own. Android's
 * network layer has no time limit of its own, so a stalled connection would
 * otherwise wait forever. The caller's own signal still works.
 */
export function fetchWithTimeout(timeoutMs: number, base: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const controller = new AbortController();
    const outer = init?.signal;
    const abort = () => controller.abort();
    if (outer) {
      if (outer.aborted) controller.abort();
      else outer.addEventListener('abort', abort);
    }
    const timer = setTimeout(abort, timeoutMs);
    return base(input, { ...init, signal: controller.signal }).finally(() => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', abort);
    });
  };
}
