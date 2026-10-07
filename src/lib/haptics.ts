// A light tap of haptic feedback. Never throws, and does nothing where
// haptics aren't available.

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function selectionFeedback(): void {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync().catch(() => undefined);
}
