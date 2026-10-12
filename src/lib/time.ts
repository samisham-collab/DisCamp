// Human-friendly times: "just now", "5 min ago", "3 hr ago", "2 days ago".

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function timeAgo(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const diff = now.getTime() - then;
  // In the future: a clock was off when it was saved, so its age is unknown.
  if (diff < -MINUTE) return null;
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} hr ago`;
  const days = Math.floor(diff / DAY);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** "Oct 7, 2026". Null for a missing or unreadable time. */
export function formatDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
