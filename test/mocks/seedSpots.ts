// Screen tests run against one known starter spot (Smoky Gardens), so adding
// starter spots never changes their expected counts, distances or map framing.
// The full list is covered by __tests__/seedSpots.test.ts and
// __tests__/screens/starterSpots.test.tsx.

import { jest } from '@jest/globals';

import type { Spot } from '@/types';

const actual = jest.requireActual<{ SEED_SPOTS: Spot[] }>('@/data/seedSpots');

export const SEED_SPOTS: Spot[] = actual.SEED_SPOTS.filter((s) => s.id === 'smoky-gardens');
