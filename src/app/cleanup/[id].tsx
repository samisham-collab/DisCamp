// One cleanup: the before photo, what and how big, where, and who posted it.
// "I cleaned it up" sends an after photo and a haul shot for review; once
// approved, the after photo and haul shot show here and the camper who
// packed it out earns Embers.

import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CleanupPhoto, cleanupEmbers, cleanupTitle } from '@/components/Cleanups';
import { Banner, Button, Card, EmptyState, Row, SectionTitle } from '@/components/ui';
import {
  CLEANUP_SIZE_HINTS,
  CLEANUP_SIZE_LABELS,
  CLEANUP_TRIES,
  deleteCleanup,
  getCleanup,
  myTries,
  type CleanupTask,
  type CleanupTry,
} from '@/data/cleanups';
import { useCleanups } from '@/data/cleanupsStore';
import { useAuth } from '@/lib/auth';
import { distanceMiles, formatCoordinates, formatDistance } from '@/lib/geo';
import { openDirectionsTo } from '@/lib/links';
import { useLocation } from '@/lib/location';
import { formatDay, timeAgo } from '@/lib/time';
import { usePostingGate } from '@/lib/usePostingGate';
import { useStillHere } from '@/lib/useStillHere';
import { colors, TOUCH_TARGET } from '@/theme';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/cleanups');
}

/** What this camper's tries say: waiting, sent back (and whether they can try again), or none. */
function triesBanner(tries: CleanupTry[] | null, open: boolean) {
  const last = tries?.at(-1);
  if (!last) return null;
  if (last.status === 'pending') {
    return (
      <Banner
        tone="info"
        icon="hourglass-outline"
        message="Your cleanup is waiting for review. A moderator checks it within a day or two, and your Embers post when it's approved."
      />
    );
  }
  if (last.status === 'rejected' && open) {
    const left = CLEANUP_TRIES - (tries?.length ?? 0);
    return (
      <Banner
        tone="warning"
        icon="arrow-undo-outline"
        message={`Sent back: ${last.reviewNote ?? 'see the photos again'}. ${
          left > 0 ? 'You can send it once more.' : "You've sent it twice, the most for one camper."
        }`}
      />
    );
  }
  return null;
}

export default function CleanupScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = first(params.id) ?? '';
  const { client, user } = useAuth();
  const { cleanups, upsert, remove } = useCleanups();
  const { coords } = useLocation();
  const canPost = usePostingGate();
  const stillHere = useStillHere();
  // The server's copy, once loaded (null: not found). Until then, the list's.
  const [loaded, setLoaded] = useState<CleanupTask | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tries, setTries] = useState<CleanupTry[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const userId = user?.id;

  // Fresh each time it comes into view: after sending a cleanup, say.
  useFocusEffect(
    useCallback(() => {
      if (!client || !id) return undefined;
      let active = true;
      getCleanup(client, id).then(
        (task) => {
          if (!active) return;
          setLoaded(task);
          setLoadError(null);
          // Gone on the server (removed, or from a camper you blocked): off the lists too.
          if (task) upsert(task);
          else remove(id);
        },
        (e: unknown) => {
          if (active) setLoadError(e instanceof Error ? e.message : "Couldn't load the cleanup.");
        },
      );
      if (userId) {
        myTries(client, id, userId).then(
          (list) => {
            if (active) setTries(list);
          },
          () => {
            // Without them the screen still works; sending says what's wrong.
            if (active) setTries([]);
          },
        );
      } else {
        setTries(null);
      }
      return () => {
        active = false;
      };
    }, [client, id, userId, upsert, remove]),
  );

  const task = loaded === undefined ? cleanups.find((t) => t.id === id) : loaded;

  if (!task) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Cleanup' }} />
        {loaded === undefined && !loadError && client ? (
          <ActivityIndicator size="large" color={colors.pine} accessibilityLabel="Loading the cleanup" />
        ) : (
          <EmptyState
            icon="leaf-outline"
            title={loadError ? "Couldn't load the cleanup" : 'Cleanup not found'}
            message={loadError ?? 'It may have been removed.'}
            actionLabel="Back to Cleanups"
            onAction={() => router.replace('/cleanups')}
          />
        )}
      </View>
    );
  }

  const mine = userId != null && task.createdBy === userId;
  const open = task.status === 'open';
  const triesLeft = CLEANUP_TRIES - (tries?.length ?? 0);
  const waiting = tries?.at(-1)?.status === 'pending';
  const canSend = open && !task.hidden && triesLeft > 0 && !waiting;
  const posted = timeAgo(task.createdAt);

  const onDelete = () => {
    Alert.alert('Delete this cleanup?', 'It comes off DisCamp for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (!client) return;
          setDeleting(true);
          void deleteCleanup(client, task).then(
            () => {
              remove(task.id);
              AccessibilityInfo.announceForAccessibility('Cleanup deleted');
              if (stillHere()) leave();
            },
            (e: unknown) => {
              setDeleting(false);
              Alert.alert("Couldn't delete the cleanup", e instanceof Error ? e.message : 'Please try again.');
            },
          );
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Cleanup' }} />

      <CleanupPhoto url={task.beforeUrl} label="Before photo" height={260} />

      <View style={styles.titleBlock}>
        <Text style={styles.name} accessibilityRole="header">
          {cleanupTitle(task)}
        </Text>
        <Text style={styles.meta}>
          {CLEANUP_SIZE_LABELS[task.size]}: {CLEANUP_SIZE_HINTS[task.size].toLowerCase()}
        </Text>
        <Text style={styles.meta}>
          Posted by {mine ? 'you' : (task.postedBy ?? 'a camper')}
          {posted ? ` ${posted}` : ''}
        </Text>
        {coords ? <Text style={styles.meta}>{formatDistance(distanceMiles(coords, task))} from you</Text> : null}
      </View>

      {task.hidden ? (
        <Banner
          tone="warning"
          icon="eye-off-outline"
          message="Hidden while DisCamp reviews reports about it. Only you can see it."
        />
      ) : null}
      {task.status === 'open' ? (
        <Banner
          tone="info"
          icon="leaf-outline"
          message={`Needs cleaning up. Pack it out and earn ${cleanupEmbers(task)} Embers once it's approved.`}
        />
      ) : null}
      {task.status === 'review' && !waiting ? (
        <Banner tone="info" icon="hourglass-outline" message="Someone cleaned this up, and it's waiting for review." />
      ) : null}
      {task.status === 'done' ? (
        <Banner
          tone="info"
          icon="checkmark-circle"
          message={`Cleaned up by ${task.cleanedById && task.cleanedById === userId ? 'you' : (task.cleanedBy ?? 'a camper')}${
            task.doneAt ? ` on ${formatDay(task.doneAt)}` : ''
          }. Thank you!`}
        />
      ) : null}
      {triesBanner(tries, open)}

      {task.note ? (
        <Card>
          <SectionTitle>Note</SectionTitle>
          <Text style={styles.body}>{task.note}</Text>
        </Card>
      ) : null}

      <View style={styles.actions}>
        {canSend ? (
          <Button
            label="I cleaned it up"
            icon="checkmark-done-outline"
            onPress={() => {
              if (canPost(`/cleanup/${task.id}`)) {
                router.push({ pathname: '/cleanup/send/[id]', params: { id: task.id } });
              }
            }}
          />
        ) : null}
        <Button
          label="Directions"
          icon="navigate-outline"
          kind="secondary"
          onPress={() => void openDirectionsTo(task, 'Cleanup')}
        />
      </View>

      {mine && open && (tries?.length ?? 0) === 0 ? (
        <Text style={styles.body}>
          Cleaned it up yourself? Tap &ldquo;I cleaned it up&rdquo; and send the after photo: you earn the Embers for
          the cleanup.
        </Text>
      ) : null}

      {task.status === 'done' && (task.afterUrl || task.haulUrl) ? (
        <Card>
          <SectionTitle>After</SectionTitle>
          {task.afterUrl ? <CleanupPhoto url={task.afterUrl} label="After photo" /> : null}
          {task.haulUrl ? <CleanupPhoto url={task.haulUrl} label="What they packed out" /> : null}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Where</SectionTitle>
        {task.spotId ? (
          <Pressable
            onPress={() => router.push({ pathname: '/spot/[id]', params: { id: task.spotId ?? '' } })}
            accessibilityRole="link"
            accessibilityHint="Opens the spot"
            style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
          >
            <Text style={styles.link}>Near {task.spotName ?? 'a spot'}</Text>
          </Pressable>
        ) : null}
        <Row label="GPS" value={formatCoordinates(task)} />
        {task.createdAt ? <Row label="Posted" value={formatDay(task.createdAt) ?? 'Not known'} /> : null}
      </Card>

      {mine && open && !task.hidden && (tries?.length ?? 0) === 0 ? (
        <Pressable
          onPress={onDelete}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityState={{ busy: deleting, disabled: deleting }}
          style={styles.textButton}
        >
          {deleting ? (
            <ActivityIndicator color={colors.red} />
          ) : (
            <Text style={styles.deleteText}>Delete this cleanup</Text>
          )}
        </Pressable>
      ) : null}
      {!mine ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/report/[kind]/[id]',
              params: {
                kind: 'task',
                id: task.id,
                ...(task.createdBy ? { owner: task.createdBy } : {}),
                ...(task.postedBy ? { name: task.postedBy } : {}),
              },
            })
          }
          accessibilityRole="button"
          style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
        >
          <Text style={styles.reportText}>Report this cleanup</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  titleBlock: { gap: 4 },
  name: { fontSize: 26, fontWeight: '800', color: colors.ink },
  meta: { fontSize: 14, color: colors.muted },
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
  actions: { gap: 10 },
  linkRow: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
  link: { fontSize: 15, fontWeight: '600', color: colors.pine, textDecorationLine: 'underline' },
  textButton: { minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 15, fontWeight: '700', color: colors.red, textDecorationLine: 'underline' },
  reportText: { fontSize: 15, fontWeight: '600', color: colors.pine, textDecorationLine: 'underline' },
  pressed: { opacity: 0.6 },
});
