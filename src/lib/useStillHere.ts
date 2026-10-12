// For work that finishes after a wait (saving, deleting): navigate only if the
// camper is still on this screen. Someone who tapped back while it saved has
// moved on, and jumping them somewhere else would be confusing, or leave them
// on a screen with no way back.

import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

export function useStillHere(): () => boolean {
  const navigation = useNavigation();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(() => mounted.current && navigation.isFocused(), [navigation]);
}
