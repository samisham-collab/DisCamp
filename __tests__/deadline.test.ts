import { describe, expect, it, jest } from '@jest/globals';

import { DeadlineError, fetchWithTimeout, withDeadline } from '@/lib/deadline';

const never = () => new Promise<never>(() => undefined);

describe('withDeadline', () => {
  it('gives the answer when it comes in time', async () => {
    await expect(withDeadline(async () => 'done', 1000)).resolves.toBe('done');
  });

  it('stops waiting at the deadline, even for work that ignores the abort', async () => {
    let seen: AbortSignal | undefined;
    const started = Date.now();
    await expect(
      withDeadline((signal) => {
        seen = signal;
        return never();
      }, 30),
    ).rejects.toBeInstanceOf(DeadlineError);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(seen?.aborted).toBe(true);
  });

  it('passes on a failure that comes in time, and swallows one that comes late', async () => {
    await expect(withDeadline(() => Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
    // An answer that settles after the deadline still counts as too late.
    await expect(
      withDeadline(
        (signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('AbortError')))),
        20,
      ),
    ).rejects.toBeInstanceOf(DeadlineError);
  });
});

describe('fetchWithTimeout', () => {
  it('aborts a request that takes too long', async () => {
    const base = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted'))),
        ),
    );
    await expect(fetchWithTimeout(20, base as typeof fetch)('https://x.test')).rejects.toThrow('Aborted');
  });

  it("follows the caller's own signal, and lets quick requests through", async () => {
    const base = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new Error('Aborted');
      return new Response('ok');
    });
    const timed = fetchWithTimeout(1000, base as typeof fetch);
    await expect(timed('https://x.test').then((r) => r.text())).resolves.toBe('ok');

    const caller = new AbortController();
    caller.abort();
    await expect(timed('https://x.test', { signal: caller.signal })).rejects.toThrow('Aborted');

    const later = new AbortController();
    const slow = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted'))),
        ),
    );
    const pending = fetchWithTimeout(1000, slow as typeof fetch)('https://x.test', { signal: later.signal });
    later.abort();
    await expect(pending).rejects.toThrow('Aborted');
  });
});
