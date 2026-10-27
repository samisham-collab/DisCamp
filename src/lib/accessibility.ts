// The phone's accessibility settings that change how DisCamp behaves:
// Reduce Motion (iOS) / Remove animations (Android) and whether a screen
// reader (VoiceOver, TalkBack) is on. Both follow the setting live.

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

function useAccessibilitySetting(
  read: () => Promise<boolean>,
  event: 'reduceMotionChanged' | 'screenReaderChanged',
): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let active = true;
    read().then(
      (value) => {
        if (active) setOn(value);
      },
      () => undefined,
    );
    const subscription = AccessibilityInfo.addEventListener(event, (value: boolean) => setOn(value));
    return () => {
      active = false;
      subscription.remove();
    };
  }, [read, event]);
  return on;
}

const readReduceMotion = () => AccessibilityInfo.isReduceMotionEnabled();
// In a browser, React Native Web always answers yes, so the web preview
// would always offer the list: it's taken as off there.
const readScreenReader = () =>
  Platform.OS === 'web' ? Promise.resolve(false) : AccessibilityInfo.isScreenReaderEnabled();

/** True when the camper asked for less motion: maps jump instead of gliding. */
export function useReducedMotion(): boolean {
  return useAccessibilitySetting(readReduceMotion, 'reduceMotionChanged');
}

/** True while VoiceOver or TalkBack is on. */
export function useScreenReader(): boolean {
  return useAccessibilitySetting(readScreenReader, 'screenReaderChanged');
}
