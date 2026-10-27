// What a spot's screens show when the spot isn't in the list: loading, a
// spot that's really gone, or one DisCamp couldn't load (offline, slow
// signal), with Retry instead of a dead end.

import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useSpots } from '../data/spots';
import { colors } from '../theme';
import { Button, EmptyState } from './ui';

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function SpotMissing({ loading }: { loading: boolean }) {
  const { error, refresh, refreshing } = useSpots();
  if (loading || refreshing) {
    return (
      <View style={styles.center} accessible accessibilityLabel="Loading spot">
        <ActivityIndicator size="large" color={colors.pine} />
        <Text style={styles.body}>Loading spot…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <EmptyState icon="cloud-offline-outline" title="Couldn't load this spot" message={error} />
        <Button label="Try again" icon="refresh" onPress={() => void refresh()} />
        <Button label="Back" kind="secondary" onPress={leave} />
      </View>
    );
  }
  return (
    <View style={styles.center}>
      <EmptyState
        icon="compass-outline"
        title="Spot not found"
        message="It may have been removed, or the link is wrong."
        actionLabel="Back to the map"
        onAction={leave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 20, gap: 12, justifyContent: 'center', backgroundColor: colors.bg },
  body: { fontSize: 15, color: colors.body, textAlign: 'center' },
});
