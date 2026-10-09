import type { Coordinates } from '../types';

export interface LocationPickerProps {
  visible: boolean;
  /** Where to start: the current pin, else the camper's location, else the default view. */
  start: Coordinates | null;
  onCancel: () => void;
  onPick: (point: Coordinates) => void;
}
