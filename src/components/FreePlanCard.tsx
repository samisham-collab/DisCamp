// For moderators, on the Review tab: how full DisCamp's free Supabase plan
// is. Photos fill it first (1 GB of files); the database has 500 MB. At the
// pause line new photos (or posts) wait, and nothing is deleted. MODERATION.md,
// "Free plan", says what to do when it gets full.

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { fetchFreePlanUsage, formatBytes, percentOf, type FreePlanUsage } from '../data/appStatus';
import { useAuth } from '../lib/auth';
import { formatDay } from '../lib/time';
import { colors } from '../theme';
import { Card, SectionTitle } from './ui';

function Meter({
  label,
  used,
  limit,
  warnAt,
  pauseAt,
}: {
  label: string;
  used: number;
  limit: number;
  warnAt: number;
  pauseAt: number;
}) {
  const percent = percentOf(used, limit);
  const color = percent >= pauseAt ? colors.red : percent >= warnAt ? colors.orange : colors.pine;
  return (
    <View style={styles.meter}>
      <Text style={styles.meterText}>
        {label}: {formatBytes(used)} of {formatBytes(limit)} ({percent}%)
      </Text>
      <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no">
        <View style={[styles.fill, { width: `${Math.min(100, percent)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function summary(u: FreePlanUsage): string {
  if (u.postingPaused) {
    return 'New spots, photos and check-ins are paused (by hand in moderation.settings, or the database is nearly full). Reports still work.';
  }
  if (u.photosPaused) {
    return 'New photos and cleanups are paused: photo storage is nearly full. Nothing was deleted. See MODERATION.md, "Free plan".';
  }
  if (u.level === 'warn') return 'Getting full. Plan ahead: see MODERATION.md, "Free plan".';
  return 'Well inside the free plan.';
}

export function FreePlanCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const { client } = useAuth();
  // Null while loading, 'failed' if it couldn't be read.
  const [usage, setUsage] = useState<{ key: number; value: FreePlanUsage | 'failed' } | null>(null);

  useEffect(() => {
    if (!client) return undefined;
    let active = true;
    void fetchFreePlanUsage(client).then((value) => {
      if (active) setUsage({ key: refreshKey, value: value ?? 'failed' });
    });
    return () => {
      active = false;
    };
  }, [client, refreshKey]);

  const shown = usage?.key === refreshKey ? usage.value : null;
  return (
    <Card>
      <SectionTitle>Free plan</SectionTitle>
      {shown == null ? <ActivityIndicator color={colors.pine} accessibilityLabel="Loading usage" /> : null}
      {shown === 'failed' ? <Text style={styles.muted}>Couldn&apos;t read usage. Pull down to try again.</Text> : null}
      {shown != null && shown !== 'failed' ? (
        <>
          <Meter
            label="Photos and files"
            used={shown.storageBytes}
            limit={shown.storageLimitBytes}
            warnAt={shown.warnAtPercent}
            pauseAt={shown.pauseAtPercent}
          />
          <Meter
            label="Database"
            used={shown.databaseBytes}
            limit={shown.databaseLimitBytes}
            warnAt={shown.warnAtPercent}
            pauseAt={shown.pauseAtPercent}
          />
          <Text style={[styles.body, shown.level !== 'ok' && styles.warn]}>{summary(shown)}</Text>
          <Text style={styles.muted}>
            {shown.spots} spots · {shown.photos} photos · {shown.cleanups} cleanups · {shown.activeCampers} campers
            signed in this month
          </Text>
          {shown.monthAgo ? (
            <Text style={styles.muted}>
              Since {formatDay(shown.monthAgo.day) ?? shown.monthAgo.day}: photos and files grew{' '}
              {formatBytes(Math.max(0, shown.storageBytes - shown.monthAgo.storageBytes))}, the database{' '}
              {formatBytes(Math.max(0, shown.databaseBytes - shown.monthAgo.databaseBytes))}.
            </Text>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  meter: { gap: 6 },
  meterText: { fontSize: 15, fontWeight: '700', color: colors.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
  warn: { color: colors.orangeDark, fontWeight: '700' },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
});
