// Browser preview: react-native-maps doesn't run on the web, so the route
// preview shows its summary without a map.

import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
import type { RouteMapProps } from './RouteMap.types';

export type { RouteMapProps } from './RouteMap.types';

export function RouteMap(_props: RouteMapProps) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>The route map shows in the phone app.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.map },
  text: { color: colors.body, fontSize: 15 },
});
