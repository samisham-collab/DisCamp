// What to tell the camper about where the spots on screen came from.

import type { SpotsState } from '../data/spots';
import { timeAgo } from './time';

export interface SpotsStatus {
  tone: 'info' | 'warning';
  message: string;
  /** Show a Retry button. */
  canRetry: boolean;
}

export function spotsStatus(
  state: Pick<SpotsState, 'remoteEnabled' | 'error' | 'loading' | 'source' | 'updatedAt'>,
  now: Date = new Date(),
): SpotsStatus | null {
  if (!state.remoteEnabled) return null;
  if (state.error) {
    const age = timeAgo(state.updatedAt, now);
    let showing = 'Showing starter spots.';
    if (state.source === 'cache') showing = age ? `Showing spots saved ${age}.` : 'Showing saved spots.';
    if (state.source === 'remote') showing = age ? `Showing spots from ${age}.` : 'Showing the last spots loaded.';
    return { tone: 'warning', message: `${state.error} ${showing}`, canRetry: true };
  }
  if (state.loading && state.source !== 'remote') {
    return { tone: 'info', message: 'Loading the latest spots…', canRetry: false };
  }
  return null;
}
