// Cleanups: trash campers have posted, nearest first, and posting one. Whoever
// packs it out sends an after photo and a haul shot; once a moderator
// approves it, they earn Embers.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CleanupRow } from '@/components/Cleanups';
import { Banner, Button, Card, EmptyState, SectionTitle } from '@/components/ui';
import type { CleanupTask } from '@/data/cleanups';
import { useCleanups } from '@/data/cleanupsStore';
import { useAuth } from '@/lib/auth';
import { CLEANUP_EMBERS } from '@/lib/embers';
import { distanceMiles } from '@/lib/geo';
import { useLocation } from '@/lib/location';
import { usePostingGate } from '@/lib/usePostingGate';
import type { Coordinates } from '@/types';
import { colors } from '@/theme';

/** Cleaned-up ones show this long. */
const RECENT_DAYS = 30;
const RECENT_SHOWN = 10;
const DAY_MS = 86_400_000;

/** Nearest first when the camper's location is known, otherwise newest first. */
function byDistance(list: CleanupTask[], from: Coordinates | null): CleanupTask[] {
  if (!from) return list;
  return [...list].sort((a, b) => distanceMiles(from, a) - distanceMiles(from, b));
}

/** The three lists: still to do, waiting for review, and cleaned up lately. */
function sections(cleanups: CleanupTask[], from: Coordinates | null, now = Date.now()) {
  const since = now - RECENT_DAYS * DAY_MS;
  return {
    open: byDistance(
      cleanups.filter((t) => t.status === 'open'),
      from,
    ),
    review: cleanups.filter((t) => t.status === 'review'),
    done: cleanups
      .filter((t) => t.status === 'done' && Date.parse(t.doneAt ?? t.createdAt) >= since)
      .slice(0, RECENT_SHOWN),
  };
}

export default function CleanupsScreen() {
  const { status } = useAuth();
  const { cleanups, loading, error, refresh } = useCleanups();
  const { coords } = useLocation();
  const canPost = usePostingGate();
  const [refreshing, setRefreshing] = useState(false);

  // Fresh each time the tab comes into view: other campers post and clean up.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const { open, review, done } = useMemo(() => sections(cleanups, coords), [cleanups, coords]);

  if (status === 'disabled') {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Cleanups aren't available"
          message="This version of DisCamp runs on its starter spots only, so cleanups are turned off."
        />
      </ScrollView>
    );
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
    >
      <Card>
        <View style={styles.introTitle}>
          <Ionicons
            accessibilityElementsHidden
            importantForAccessibility="no"
            name="leaf-outline"
            size={24}
            color={colors.pine}
          />
          <Text style={styles.title} accessibilityRole="header">
            Leave it better
          </Text>
        </View>
        <Text style={styles.body}>
          Found trash at a site? Post it with a photo. Pack it out, send an after photo and a shot of what you hauled,
          and earn {CLEANUP_EMBERS.small} to {CLEANUP_EMBERS.large} Embers once it&apos;s approved.
        </Text>
        <Button
          label="Post a cleanup"
          icon="camera-outline"
          onPress={() => {
            if (canPost('/cleanups')) router.push('/cleanup/new');
          }}
        />
      </Card>

      {error ? (
        <Banner tone="error" message={error} actionLabel="Retry" onAction={() => void refresh()} announceKey={error} />
      ) : null}
      {loading && cleanups.length === 0 ? (
        <ActivityIndicator color={colors.pine} accessibilityLabel="Loading cleanups" />
      ) : null}

      {!loading && !error && cleanups.length === 0 ? (
        <EmptyState
          icon="sparkles-outline"
          title="No cleanups yet"
          message="When campers post trash that needs packing out, it shows here and on the map."
        />
      ) : null}

      {open.length > 0 ? (
        <Card>
          <SectionTitle>To clean up</SectionTitle>
          {coords ? null : <Text style={styles.hint}>Newest first. Turn on location to see the nearest first.</Text>}
          {open.map((task) => (
            <CleanupRow key={task.id} task={task} from={coords} />
          ))}
        </Card>
      ) : null}

      {review.length > 0 ? (
        <Card>
          <SectionTitle>Waiting for review</SectionTitle>
          {review.map((task) => (
            <CleanupRow key={task.id} task={task} from={coords} />
          ))}
        </Card>
      ) : null}

      {done.length > 0 ? (
        <Card>
          <SectionTitle>Cleaned up lately</SectionTitle>
          {done.map((task) => (
            <CleanupRow key={task.id} task={task} from={coords} />
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  introTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink },
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
  hint: { fontSize: 13, color: colors.muted },
});
