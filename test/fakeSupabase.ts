// A tiny stand-in for the Supabase client: just the query chain DisCamp uses.

import type { SupabaseClient } from '@supabase/supabase-js';

export type QueryResult = { data: unknown[] | null; error: { message: string; code?: string } | null };

/** Every `.retry(...)` setting the app asked for, newest last. */
export const retries: boolean[] = [];

export function fakeClient(respond: (signal: AbortSignal) => Promise<QueryResult>): SupabaseClient {
  const builder = {
    select: () => builder,
    order: () => builder,
    retry: (enabled: boolean) => {
      retries.push(enabled);
      return builder;
    },
    abortSignal: (signal: AbortSignal) => respond(signal),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}
