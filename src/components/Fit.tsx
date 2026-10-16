// Fit status visuals: the map pin, a compact badge and the full banner.
// Each status has its own icon, so color is never the only signal.

import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import type { FitResult, FitStatus } from '../lib/fit';
import { colors, fitColors } from '../theme';
import type { IconName } from './ui';

export function FitIcon({ status, size = 16 }: { status: FitStatus; size?: number }) {
  const c = fitColors[status];
  return (
    <Ionicons
      accessibilityElementsHidden
      importantForAccessibility="no"
      name={c.icon as IconName}
      size={size}
      color={c.text}
    />
  );
}

export function SpotPin({ status, selected }: { status: FitStatus; selected: boolean }) {
  return (
    <View style={[styles.pin, { backgroundColor: fitColors[status].fill }, selected && styles.pinSelected]}>
      <FitIcon status={status} size={selected ? 20 : 18} />
    </View>
  );
}

export function FitBadge({ fit }: { fit: FitResult }) {
  const c = fitColors[fit.status];
  return (
    <View style={styles.badge}>
      <View style={[styles.dot, { backgroundColor: c.fill }]}>
        <FitIcon status={fit.status} size={12} />
      </View>
      <Text style={styles.badgeText}>{fit.headline}</Text>
    </View>
  );
}

export function FitBanner({ fit, rigName }: { fit: FitResult; rigName: string }) {
  const c = fitColors[fit.status];
  return (
    <View style={[styles.banner, { backgroundColor: c.tint, borderColor: c.fill }]}>
      <View style={[styles.bannerIcon, { backgroundColor: c.fill }]}>
        <FitIcon status={fit.status} size={18} />
      </View>
      <View style={styles.bannerBody}>
        <Text style={styles.bannerTitle} accessibilityRole="header">
          {fit.headline}
        </Text>
        {fit.reasons.map((r, i) => (
          <Text key={`r${i}`} style={styles.bannerReason}>
            • {r}
          </Text>
        ))}
        {fit.notes.map((n, i) => (
          <Text key={`n${i}`} style={styles.bannerNote}>
            Note: {n}
          </Text>
        ))}
        <Text style={styles.bannerRig}>Checked against: {rigName}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinSelected: { width: 42, height: 42, borderRadius: 21, borderColor: colors.ink, borderWidth: 3 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 15, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  banner: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1.5 },
  bannerIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  bannerBody: { flex: 1, gap: 2 },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  bannerReason: { fontSize: 14, color: colors.body },
  bannerNote: { fontSize: 14, color: colors.body, fontStyle: 'italic' },
  bannerRig: { fontSize: 12, color: colors.muted, marginTop: 4 },
});
