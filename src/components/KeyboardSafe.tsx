// Keeps text fields clear of the keyboard on Android. Android apps now draw
// edge to edge, so the window no longer shrinks when the keyboard opens, and
// ScrollView's automaticallyAdjustKeyboardInsets only works on iPhone. This
// pads the screen by the part of it the keyboard covers, so the form can
// scroll the field into view. On iPhone it does nothing.

import { useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

export function KeyboardSafe({ children }: { children: ReactNode }) {
  const frame = useRef<View>(null);
  // How far down the screen this view starts (below the header), which the
  // keyboard's position is measured against.
  const [top, setTop] = useState(0);
  if (Platform.OS !== 'android') return children;
  return (
    <View
      ref={frame}
      style={styles.fill}
      onLayout={() => frame.current?.measureInWindow((_x, y) => setTop(Number.isFinite(y) ? y : 0))}
    >
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={top} style={styles.fill}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
