// Display names show on spots a camper adds. Same rules as the database
// (profiles_display_name_ok in migration 0003), checked here first so the
// camper gets a clear message instead of a server error.

import { charCount } from './schemas';

export const MAX_DISPLAY_NAME = 40;

/** Shown until a camper picks a name, and when a provider gave none. */
export const DEFAULT_DISPLAY_NAME = 'Camper';

export type NameCheck = { ok: true; name: string } | { ok: false; message: string };

export function checkDisplayName(input: string): NameCheck {
  // Trim the ends and squeeze runs of spaces, tabs or line breaks into one space.
  const name = input.replace(/\s+/g, ' ').trim();
  if (name === '') return { ok: false, message: 'Enter a name.' };
  if (charCount(name) > MAX_DISPLAY_NAME) {
    return { ok: false, message: `Use ${MAX_DISPLAY_NAME} characters or fewer.` };
  }
  if (name.includes('@')) return { ok: false, message: "Use a name, not an email address (no '@')." };
  return { ok: true, name };
}
