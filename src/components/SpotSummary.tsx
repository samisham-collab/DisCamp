// The card that pops up when a pin is tapped, and the row used in list view.

import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { CHANGE_LABELS } from '../data/community';
import { formatFee } from '../lib/cost';
import { COMPASS_WORDS, formatDistance, formatDistanceSpoken } from '../lib/geo';
import type { SpotRow } from '../lib/spotRows';
import { timeAgo } from '../lib/time';
import { colors, radius, shadow, TOUCH_TARGET } from '../theme';
import type { Spot } from '../types';
import { CostMeter } from './CostMeter';
import { FitBadge } from './Fit';
import { Button } from './ui';

export function siteTypeLabel(spot: Pick<Spot, 'siteType'>): string {
  return spot.siteType === 'campground' ? 'Campground' : 'Dispersed';
}

/** "11 mi S", or "Under 0.1 mi" when the direction would be meaningless. */
function distanceLine(row: SpotRow): string | null {
  if (row.distanceMi == null) return null;
  const distance = formatDistance(row.distanceMi);
  return row.direction && row.distanceMi >= 0.1 ? `${distance} ${row.direction}` : distance;
}

function distanceSpoken(row: SpotRow): string | null {
  if (row.distanceMi == null) return null;
  const distance = formatDistanceSpoken(row.distanceMi);
  return row.direction && row.distanceMi >= 0.1 ? `${distance} ${COMPASS_WORDS[row.direction]}` : distance;
}

/** Distance first: long land-manager names would otherwise push it out of sight. */
function metaLine(row: SpotRow): string {
  return [distanceLine(row), siteTypeLabel(row.spot), row.spot.landManager].filter(Boolean).join(' · ');
}

/** The newest change a camper reported, like "Gate locked or road closed, 2 days ago". */
function changeLine(spot: Spot): string | null {
  const latest = spot.alerts?.[0];
  if (!latest) return null;
  const ago = timeAgo(latest.at);
  return `${CHANGE_LABELS[latest.kind]}${ago ? `, ${ago}` : ''}`;
}

/** "Confirmed 3 days ago", when a camper has said it's still good. */
function confirmedLine(spot: Spot): string | null {
  const ago = timeAgo(spot.lastConfirmedAt ?? null);
  return ago ? `Confirmed ${ago}` : null;
}

function spokenSummary(row: SpotRow): string {
  const { spot, fit, cost } = row;
  const change = changeLine(spot);
  return [
    spot.name,
    change ? `Camper reported: ${change}` : confirmedLine(spot),
    fit.headline,
    `Cost for your rig: ${formatFee(cost.feeUsd)}`,
    spot.access.impassableWhenWet ? 'Road is impassable when wet' : null,
    siteTypeLabel(spot),
    spot.landManager,
    distanceSpoken(row),
  ]
    .filter(Boolean)
    .join('. ');
}

/** A short warning that matters before driving in. */
function WetRoadFlag({ spot }: { spot: Spot }) {
  if (!spot.access.impassableWhenWet) return null;
  return (
    <View style={styles.flag}>
      <Ionicons
        accessibilityElementsHidden
        importantForAccessibility="no"
        name="rainy-outline"
        size={16}
        color={colors.orangeDark}
      />
      <Text style={styles.flagText}>Impassable when wet</Text>
    </View>
  );
}

/** A change campers reported (it outranks everything else), or when it was last confirmed. */
function CheckinFlag({ spot }: { spot: Spot }) {
  const change = changeLine(spot);
  if (change) {
    return (
      <View style={styles.flag}>
        <Ionicons
          accessibilityElementsHidden
          importantForAccessibility="no"
          name="alert-circle-outline"
          size={16}
          color={colors.orangeDark}
        />
        <Text style={styles.flagText} numberOfLines={2}>
          {change}
        </Text>
      </View>
    );
  }
  const confirmed = confirmedLine(spot);
  if (!confirmed) return null;
  return (
    <View style={styles.flag}>
      <Ionicons
        accessibilityElementsHidden
        importantForAccessibility="no"
        name="checkmark-circle-outline"
        size={16}
        color={colors.pine}
      />
      <Text style={styles.confirmed}>{confirmed}</Text>
    </View>
  );
}

export function SpotSummaryCard({
  row,
  onOpen,
  onClose,
  onLayout,
}: {
  row: SpotRow;
  onOpen: () => void;
  onClose: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  return (
    <View style={styles.sheet} onLayout={onLayout} testID="spot-summary">
      <View style={styles.sheetHeader}>
        <View style={styles.sheetTitleBlock}>
          <Text style={styles.sheetTitle} accessibilityRole="header" numberOfLines={2}>
            {row.spot.name}
          </Text>
          <Text style={styles.meta} numberOfLines={2}>
            {metaLine(row)}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          style={styles.close}
        >
          <Ionicons
            accessibilityElementsHidden
            importantForAccessibility="no"
            name="close"
            size={22}
            color={colors.muted}
          />
        </Pressable>
      </View>
      <FitBadge fit={row.fit} />
      <CheckinFlag spot={row.spot} />
      <WetRoadFlag spot={row.spot} />
      <View style={styles.costBlock}>
        <Text style={styles.costLabel}>Cost for your rig: {formatFee(row.cost.feeUsd)}</Text>
        <CostMeter level={row.cost.level} size="sm" />
      </View>
      <Button label="View spot" icon="arrow-forward" onPress={onOpen} />
    </View>
  );
}

export function SpotListItem({ row, onPress }: { row: SpotRow; onPress: () => void }) {
  const { spot, fit, cost } = row;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spokenSummary(row)}
      accessibilityHint="Opens the spot details"
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
      testID={`spot-item-${spot.id}`}
    >
      <View style={styles.itemBody}>
        <Text style={styles.itemTitle}>{spot.name}</Text>
        <Text style={styles.meta}>{metaLine(row)}</Text>
        <FitBadge fit={fit} />
        <CheckinFlag spot={spot} />
        <WetRoadFlag spot={spot} />
        <View style={styles.costBlock}>
          <Text style={styles.costLabel}>{formatFee(cost.feeUsd)}</Text>
          <CostMeter level={cost.level} size="sm" />
        </View>
      </View>
      <Ionicons
        accessibilityElementsHidden
        importantForAccessibility="no"
        name="chevron-forward"
        size={20}
        color={colors.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    padding: 16,
    gap: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    ...shadow,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sheetTitleBlock: { flex: 1, gap: 2 },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: colors.ink },
  close: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    marginTop: -8,
    marginRight: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { fontSize: 14, color: colors.muted },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flagText: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: colors.orangeDark },
  confirmed: { fontSize: 14, color: colors.body },
  costBlock: { gap: 6 },
  costLabel: { fontSize: 14, fontWeight: '600', color: colors.body },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  itemBody: { flex: 1, gap: 8 },
  itemTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  pressed: { opacity: 0.75 },
});
