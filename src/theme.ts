// Colors and spacing used across the app. Matches the clickable prototype.
// Text colors meet WCAG AA contrast (4.5:1) on the backgrounds they're used on.

import type { FitStatus } from './lib/fit';

export const colors = {
  pine: '#1F5C43',
  pineDark: '#163F2E',
  pineTint: '#E3F1E8',
  ink: '#18251F',
  body: '#3A4A42',
  muted: '#55635B',
  line: '#D5DDD6',
  lineStrong: '#B8C4BC',
  lineSoft: '#E6ECE7',
  bg: '#F4F6F2',
  card: '#FFFFFF',
  orange: '#B9530F',
  orangeDark: '#8A3C0A',
  orangeTint: '#FBEADF',
  red: '#B42318',
  redTint: '#FBE4E1',
  map: '#DCE5D8',
  you: '#2B6CB0',
  overlay: 'rgba(24, 37, 31, 0.45)',
  /** Bottom tabs: the selected one is green, the rest gray (both 4.5:1 on white). */
  tabOn: '#1E7A4C',
  tabOff: '#6B7770',
} as const;

export const fitColors: Record<FitStatus, { fill: string; tint: string; text: string; icon: string }> = {
  fits: { fill: '#1E7A4C', tint: '#E3F1E8', text: '#FFFFFF', icon: 'checkmark' },
  tight: { fill: '#F0B429', tint: '#FCF1D4', text: '#18251F', icon: 'alert' },
  no: { fill: '#B42318', tint: '#FBE4E1', text: '#FFFFFF', icon: 'close' },
  unknown: { fill: '#6B7770', tint: '#ECEFEC', text: '#FFFFFF', icon: 'help' },
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Minimum size for anything tappable (Apple and Google guidelines). */
export const TOUCH_TARGET = 44;

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
} as const;
