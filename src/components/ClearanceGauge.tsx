// C1–C7 strip with the spot's clearance tier highlighted.

import { StyleSheet, Text, View } from 'react-native';

import { CLEARANCE_TIERS } from '../lib/fit';
import { colors } from '../theme';
import type { ClearanceTier } from '../types';

export function ClearanceGauge({ tier }: { tier: ClearanceTier | null }) {
  return (
    <View
      style={styles.track}
      accessible
      accessibilityRole="text"
      accessibilityLabel={tier == null ? 'Clearance not reported' : `Clearance tier C${tier} of 7`}
    >
      {CLEARANCE_TIERS.map((t) => {
        const current = tier === t.tier;
        const below = tier != null && t.tier < tier;
        return (
          <View key={t.tier} style={[styles.seg, current ? styles.current : below ? styles.below : styles.above]}>
            <Text style={[styles.text, current ? styles.textCurrent : below ? styles.textBelow : null]}>C{t.tier}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: 4 },
  seg: { flex: 1, minHeight: 30, paddingVertical: 4, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  current: { backgroundColor: colors.pine },
  below: { backgroundColor: '#CFE0D6' },
  above: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  text: { fontSize: 12, fontWeight: '700', color: colors.muted },
  textCurrent: { color: '#FFFFFF' },
  textBelow: { color: colors.pine },
});
