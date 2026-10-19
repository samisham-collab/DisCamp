// Shared props for the native map (SpotMap.tsx) and the browser preview
// stand-in (SpotMap.web.tsx), so both stay interchangeable.

import type { Ref } from 'react';

import type { Region } from '../lib/geo';
import type { SpotRow } from '../lib/spotRows';
import type { Coordinates } from '../types';

export interface SpotMapHandle {
  /** Zoom to show every row on the map. */
  fitToRows: () => void;
  centerOn: (at: Coordinates) => void;
  /**
   * Show the camper and the few spots nearest them. Spots span the country,
   * so a plain zoom on the camper often shows no pins at all.
   */
  showAround: (at: Coordinates) => void;
  /** Where the map is now (after the camper's last pan or zoom), if known. */
  currentRegion: () => Region | null;
}

/** A cleanup still to do, shown as an orange pin. */
export interface CleanupPin extends Coordinates {
  id: string;
  /** Read by screen readers: "Cleanup: Litter · small". */
  label: string;
}

export interface SpotMapProps {
  ref?: Ref<SpotMapHandle>;
  rows: SpotRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  mapType: 'standard' | 'hybrid';
  showsUserLocation: boolean;
  initialRegion: Region;
  /** Space covered by the summary card, so the map's legal text stays visible. */
  bottomInset: number;
  /** Called once the map can move. Camera moves before this are ignored on Android. */
  onMapReady?: () => void;
  /** Cleanups to show, and what tapping one does. */
  cleanups?: readonly CleanupPin[];
  onOpenCleanup?: (id: string) => void;
}
