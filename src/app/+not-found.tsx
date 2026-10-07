// Shown for links to pages that don't exist, e.g. an old or mistyped link.

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui';
import { colors } from '@/theme';

export default function NotFoundScreen() {
  return (
    <View style={styles.screen}>
      <EmptyState
        icon="compass-outline"
        title="This page doesn't exist"
        message="The link may be old or mistyped."
        actionLabel="Go to the map"
        onAction={() => router.replace('/')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
});
