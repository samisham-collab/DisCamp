// Web preview: browsers have no keychain, so the session sits in localStorage
// (Supabase's own default on the web). The phone apps use secureStorage.ts.

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage blocked, e.g. a private window
  }
}

export const secureSessionStorage = {
  getItem(key: string): Promise<string | null> {
    return Promise.resolve(store()?.getItem(key) ?? null);
  },
  setItem(key: string, value: string): Promise<void> {
    store()?.setItem(key, value);
    return Promise.resolve();
  },
  removeItem(key: string): Promise<void> {
    store()?.removeItem(key);
    return Promise.resolve();
  },
};
