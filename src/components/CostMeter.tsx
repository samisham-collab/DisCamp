// Four-step meter: Free, $, $$, $$$ per night.
// Segments fill up to the spot's level; all outlined when the fee is unknown.

import { StyleSheet, Text, View } from 'react-native';

import { COST_LEVELS, type CostLevel } from '../lib/cost';
import { colors } from '../theme';

const LEVEL_COLORS: Record<CostLevel, string> = {
  0: '#1E7A4C',
  1: colors.pine,
  2: colors.orange,
  3: colors.red,
};

const STEPS: readonly CostLevel[] = [0, 1, 2, 3];

export function costMeterLabel(level: CostLevel | null): string {
  return level == null ? 'Fee not reported' : `${COST_LEVELS[level].label}, ${COST_LEVELS[level].range}`;
}

export function CostMeter({ level, size = 'lg' }: { level: CostLevel | null; size?: 'sm' | 'lg' }) {
  const label = costMeterLabel(level);
  const fill = level == null ? null : LEVEL_COLORS[level];
  const minHeight = size === 'lg' ? 34 : 26;

  return (
    <View accessible accessibilityRole="text" accessibilityLabel={`Cost meter: ${label}`} style={styles.wrap}>
      <View style={styles.track}>
        {STEPS.map((step) => {
          const on = fill != null && level != null && step <= level;
          return (
            <View key={step} style={[styles.seg, { minHeight }, on ? { backgroundColor: fill } : styles.segOff]}>
              <Text style={[styles.segText, size === 'sm' && styles.segTextSm, on && styles.segTextOn]}>
                {COST_LEVELS[step].symbol}
              </Text>
            </View>
          );
        })}
      </View>
      {size === 'lg' && <Text style={styles.caption}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  track: { flexDirection: 'row', gap: 4 },
  seg: { flex: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  segOff: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  segText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  segTextSm: { fontSize: 12 },
  segTextOn: { color: '#FFFFFF' },
  caption: { fontSize: 14, color: colors.body },
});
