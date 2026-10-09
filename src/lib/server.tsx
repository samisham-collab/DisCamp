// One Supabase connection for the whole app, shared through context so every
// part (spots, sign-in, saving) talks to the same server, and tests can swap
// in a fake in one place.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createContext, useContext, useState, type ReactNode } from 'react';

import { getSupabase } from './supabase';

// undefined: no ServerProvider above, so use the configured client.
const ServerContext = createContext<SupabaseClient | null | undefined>(undefined);

export function ServerProvider({ children, client }: { children: ReactNode; client?: SupabaseClient | null }) {
  const [value] = useState(() => (client !== undefined ? client : getSupabase()));
  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
}

/**
 * The client to use: an explicit one (tests), else the app's shared one, else
 * the configured one. Fixed for the component's lifetime.
 */
export function useServerClient(explicit?: SupabaseClient | null): SupabaseClient | null {
  const shared = useContext(ServerContext);
  const [client] = useState(() => {
    if (explicit !== undefined) return explicit;
    if (shared !== undefined) return shared;
    return getSupabase();
  });
  return client;
}
