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
}
