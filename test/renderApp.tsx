// Renders the real app (every route in src/app) at a given URL, after saving
// any rig or preferences the test wants to start with.

import { STORAGE_KEYS } from '@/config';
import { kvStore } from '@/lib/kvStore';
import type { Prefs } from '@/lib/schemas';
import type { Rig } from '@/types';
import { renderRouter, screen } from 'expo-router/testing-library';

export async function renderApp(
  initialUrl: string,
  { rig, prefs }: { rig?: Rig; prefs?: Partial<Prefs> } = {},
): Promise<ReturnType<typeof renderRouter>> {
  if (rig) await kvStore.setItem(STORAGE_KEYS.rig, JSON.stringify(rig));
  if (prefs) {
    await kvStore.setItem(
      STORAGE_KEYS.prefs,
      JSON.stringify({ filters: [], mapType: 'standard', view: 'map', ...prefs }),
    );
  }
  const result = renderRouter('./src/app', { initialUrl });
  // The splash screen stays up until saved settings load; wait for the app.
  await screen.findByTestId('app-ready');
  return result;
}
