// "Close" in the header of screens that slide up (sign-in, reports, check-ins,
// cleanups). On iPhone a swipe down closes them too, but that's hard to find,
// and awkward with VoiceOver or Switch Control; every state of these screens
// (even "not found" or "sign-in isn't available") needs a way out.

import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, TOUCH_TARGET } from '../theme';

export function closeModal() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function HeaderClose() {
  return (
    <Pressable
      onPress={closeModal}
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.text}>Close</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: TOUCH_TARGET, minWidth: TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: 4 },
  text: { fontSize: 17, fontWeight: '600', color: colors.pine },
  pressed: { opacity: 0.6 },
});
