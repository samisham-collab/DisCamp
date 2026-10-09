// Browser preview: react-native-maps doesn't run on the web, so there's no
// map to drop a pin on. The form's GPS field and "Use my location" still work.

import type { LocationPickerProps } from './LocationPicker.types';

export type { LocationPickerProps } from './LocationPicker.types';

export const LOCATION_PICKER_AVAILABLE = false;

export function LocationPicker(_props: LocationPickerProps) {
  return null;
}
