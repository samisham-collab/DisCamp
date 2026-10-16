// "What do the colors mean?" sheet: pin colors, cleanup pins and the cost meter.

import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COST_LEVELS, type CostLevel } from '../lib/cost';
import { FIT_HEADLINES, type FitStatus } from '../lib/fit';
import { colors, radius } from '../theme';
import { SpotPin } from './Fit';
import { Button, SectionTitle } from './ui';

const STATUSES: readonly { status: FitStatus; detail: string }[] = [
  { status: 'fits', detail: 'Your clearance, drivetrain and setup all work.' },
  { status: 'tight', detail: 'Possible, but the road is one tier rougher than your rig, or AWD is recommended.' },
  { status: 'unknown', detail: "Campers haven't reported enough to check your rig yet." },
  { status: 'no', detail: 'Something rules it out, like clearance, length or no turnaround.' },
];

const LEVELS: readonly CostLevel[] = [0, 1, 2, 3];

export function LegendModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title} accessibilityRole="header">
              Reading the map
            </Text>
            <SectionTitle>Pins: does it fit your rig?</SectionTitle>
            {STATUSES.map(({ status, detail }) => (
              <View key={status} style={styles.row}>
                <SpotPin status={status} selected={false} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{FIT_HEADLINES[status]}</Text>
                  <Text style={styles.rowDetail}>{detail}</Text>
                </View>
              </View>
            ))}
            <SectionTitle>Orange map pins: cleanups</SectionTitle>
            <View style={styles.row}>
              <Ionicons
                accessibilityElementsHidden
                importantForAccessibility="no"
                name="location"
                size={28}
                color={colors.orange}
              />
              <Text style={styles.rowDetail}>
                Trash a camper posted that still needs packing out. Tap one to see it, and earn Embers for cleaning it
                up.
              </Text>
            </View>
            <SectionTitle>Cost meter: per night for your rig</SectionTitle>
            {LEVELS.map((level) => (
              <View key={level} style={styles.row}>
                <Text style={styles.symbol}>{COST_LEVELS[level].symbol}</Text>
                <Text style={styles.rowDetail}>{COST_LEVELS[level].range}</Text>
              </View>
            ))}
            <Text style={styles.rowDetail}>
              Trailers and big rigs are priced on the RV hookup fee when a spot has one.
            </Text>
            <Button label="Got it" onPress={onClose} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    maxHeight: '85%',
  },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  rowDetail: { fontSize: 14, color: colors.body, flexShrink: 1 },
  symbol: { width: 40, fontSize: 15, fontWeight: '800', color: colors.ink, textAlign: 'center' },
});
