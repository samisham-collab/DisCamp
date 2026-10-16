// Pieces the cleanup screens share: a cleanup's title and status, a row in a
// list, a photo that opens full size, and the "Cleanups" card on spot pages.

import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CLEANUP_KIND_LABELS, CLEANUP_SIZE_LABELS, type CleanupStatus, type CleanupTask } from '../data/cleanups';
import { useCleanups } from '../data/cleanupsStore';
import { useAuth } from '../lib/auth';
import { CLEANUP_EMBERS } from '../lib/embers';
import { distanceMiles, formatDistance } from '../lib/geo';
import { timeAgo } from '../lib/time';
import { usePostingGate } from '../lib/usePostingGate';
import type { Coordinates, Spot } from '../types';
import { colors, radius, TOUCH_TARGET } from '../theme';
import { Button, Card, SectionTitle } from './ui';

/** "Litter · small". */
export function cleanupTitle(task: Pick<CleanupTask, 'kind' | 'size'>): string {
  return `${CLEANUP_KIND_LABELS[task.kind]} · ${CLEANUP_SIZE_LABELS[task.size].toLowerCase()}`;
}

const STATUS: Record<
  CleanupStatus,
  { label: string; icon: 'leaf-outline' | 'hourglass-outline' | 'checkmark-circle' }
> = {
  open: { label: 'Needs cleaning up', icon: 'leaf-outline' },
  review: { label: 'Cleanup waiting for review', icon: 'hourglass-outline' },
  done: { label: 'Cleaned up', icon: 'checkmark-circle' },
};

export function statusLabel(task: Pick<CleanupTask, 'status'>): string {
  return STATUS[task.status].label;
}

/** Embers for cleaning it up, at the size it was posted. */
export function cleanupEmbers(task: Pick<CleanupTask, 'size'>): number {
  return CLEANUP_EMBERS[task.size];
}

/** "Near Sublett Dam · 0.4 mi away · posted 2 days ago". */
export function cleanupMeta(task: CleanupTask, from: Coordinates | null): string {
  const parts = [
    task.spotName ? `Near ${task.spotName}` : null,
    from ? `${formatDistance(distanceMiles(from, task))} away` : null,
    timeAgo(task.createdAt) ? `posted ${timeAgo(task.createdAt)}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

export function CleanupRow({ task, from }: { task: CleanupTask; from: Coordinates | null }) {
  const status = STATUS[task.status];
  const meta = cleanupMeta(task, from);
  const shown = task.hidden ? 'Hidden while reports are reviewed' : status.label;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/cleanup/[id]', params: { id: task.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${cleanupTitle(task)}. ${shown}. ${meta}`}
      accessibilityHint="Opens the cleanup"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Image source={{ uri: task.beforeUrl }} style={styles.rowThumb} contentFit="cover" />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {cleanupTitle(task)}
        </Text>
        <View style={styles.rowStatus}>
          <Ionicons
            accessibilityElementsHidden
            importantForAccessibility="no"
            name={status.icon}
            size={14}
            color={task.status === 'open' ? colors.orange : colors.pine}
          />
          <Text style={styles.rowStatusText}>{shown}</Text>
        </View>
        {meta ? (
          <Text style={styles.rowMeta} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Ionicons
        accessibilityElementsHidden
        importantForAccessibility="no"
        name="chevron-forward"
        size={18}
        color={colors.muted}
      />
    </Pressable>
  );
}

/** A photo that opens full size when tapped. */
export function CleanupPhoto({ url, label, height = 220 }: { url: string; label: string; height?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={label}
        accessibilityHint="Opens it full size"
      >
        <Image source={{ uri: url }} style={[styles.photo, { height }]} contentFit="cover" transition={150} />
      </Pressable>
      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.viewer}>
          <Image
            source={{ uri: url }}
            style={styles.viewerImage}
            contentFit="contain"
            accessibilityLabel={label}
            testID="photo-full-size"
          />
          <Pressable
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => [styles.viewerClose, pressed && styles.pressed]}
          >
            <Ionicons
              accessibilityElementsHidden
              importantForAccessibility="no"
              name="close"
              size={26}
              color="#FFFFFF"
            />
          </Pressable>
        </SafeAreaView>
      </Modal>
    </>
  );
}

/** On a spot's page: its cleanups still to do, and posting one. */
export function SpotCleanups({ spot }: { spot: Spot }) {
  const { client } = useAuth();
  const { cleanups } = useCleanups();
  const canPost = usePostingGate();
  // Without a server there are no cleanups.
  if (!client) return null;
  const here = cleanups.filter((t) => t.spotId === spot.id && t.status !== 'done' && !t.hidden);
  return (
    <Card>
      <SectionTitle>Cleanups</SectionTitle>
      {here.length === 0 ? (
        <Text style={styles.body}>
          Trash here? Post it with a photo, and whoever packs it out earns Embers. Clean it up yourself and you earn
          them.
        </Text>
      ) : (
        here.map((task) => <CleanupRow key={task.id} task={task} from={null} />)
      )}
      <Button
        label="Post a cleanup here"
        icon="leaf-outline"
        kind="secondary"
        onPress={() => {
          if (canPost(`/spot/${spot.id}`)) {
            router.push({ pathname: '/cleanup/new', params: { spot: spot.id } });
          }
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: TOUCH_TARGET,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  rowThumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.lineSoft },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  rowStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowStatusText: { fontSize: 14, color: colors.body },
  rowMeta: { fontSize: 13, color: colors.muted },
  photo: { width: '100%', borderRadius: radius.md, backgroundColor: colors.lineSoft },
  viewer: { flex: 1, backgroundColor: '#000000' },
  viewerImage: { flex: 1 },
  viewerClose: {
    position: 'absolute',
    top: 56,
    right: 16,
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  pressed: { opacity: 0.7 },
});
