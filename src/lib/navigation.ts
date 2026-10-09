// Where to go after signing in. The sign-in screen takes a `next` path from
// its link; only these known screens are accepted, so a crafted link can't
// send a camper anywhere unexpected.

const SAFE_NEXT = /^\/(?:account|spot\/new|spot\/edit\/[A-Za-z0-9_-]{1,100})$/;

export function safeNext(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && SAFE_NEXT.test(value) ? value : null;
}
