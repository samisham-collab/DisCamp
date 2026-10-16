// Where to go after signing in. The sign-in screen takes a `next` path from
// its link; only these known screens are accepted, so a crafted link can't
// send a camper anywhere unexpected.

const ID = '[A-Za-z0-9_-]{1,100}';
const SAFE_NEXT = new RegExp(
  `^/(?:account|spot/new|spot/edit/${ID}|spot/${ID}|report/spot/${ID}|report/camper/[0-9a-f-]{36}|report/photo/[0-9a-f-]{36}|report/checkin/[0-9]{1,18}|checkin/${ID}|cleanups|review|cleanup/[0-9a-f-]{36}|report/task/[0-9a-f-]{36})$`,
);

export function safeNext(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && SAFE_NEXT.test(value) ? value : null;
}
