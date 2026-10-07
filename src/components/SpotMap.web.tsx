// Browser preview stand-in for the map. react-native-maps doesn't run on the
// web, so this shows the pins as a simple list. The real app is iOS/Android.

import { useEffect, useImperativeHandle } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../theme';
import { SpotPin } from './Fit';
import type { SpotMapProps } from './SpotMap.types';

export type { SpotMapHandle, SpotMapProps } from './SpotMap.types';

export function SpotMap({ ref, rows, selectedId, onSelect, bottomInset, onMapReady }: SpotMapProps) {
  useImperativeHandle(ref, () => ({ fitToRows: () => undefined, centerOn: () => undefined }), []);
  useEffect(() => onMapReady?.(), [onMapReady]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]} testID="spot-map">
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 16 }]}>
        <Text style={styles.note}>Map preview isn&apos;t available in the browser. Pins:</Text>
        {rows.map((row) => (
          <Pressable
            key={row.spot.id}
            onPress={() => onSelect(row.spot.id)}
            accessibilityRole="button"
            accessibilityLabel={`${row.spot.name}: ${row.fit.headline}`}
            style={[styles.pinRow, row.spot.id === selectedId && styles.pinRowOn]}
          >
            <SpotPin status={row.fit.status} selected={row.spot.id === selectedId} />
            <Text style={styles.pinName}>{row.spot.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.map },
  // Right padding keeps rows clear of the map buttons in the top-right corner.
  content: { padding: 16, paddingTop: 56, paddingRight: 76, gap: 8 },
  note: { fontSize: 13, color: colors.body },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  pinRowOn: { backgroundColor: colors.card },
  pinName: { fontSize: 15, fontWeight: '600', color: colors.ink },
});
