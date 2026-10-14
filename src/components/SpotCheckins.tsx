// "Were you here?": one tap for "Still good", or report a change. Shows when
// campers last confirmed the spot and what they've said recently; other
// campers' check-ins can be reported. The camper who added a spot can report
// changes, but other campers confirm it.
//
// "Still good" works once per camper per spot every 30 days. After it, the
// button shows it's done; "Something changed" is still there, and takes the
// "Still good" back.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  CHANGE_LABELS,
  CommunityError,
  confirmAgainAt,
  listCheckins,
  myLastConfirmation,
  sendCheckin,
  type Checkin,
  type MyConfirmation,
} from '../data/community';
import { useSpots } from '../data/spots';
import { useAuth } from '../lib/auth';
import { formatDay, timeAgo } from '../lib/time';
import { usePostingGate } from '../lib/usePostingGate';
import type { Spot } from '../types';
import { colors } from '../theme';
import { Button, Card, SectionTitle } from './ui';

/** "Confirmed 3 days ago", or that nobody has yet. */
export function confirmedLabel(spot: Pick<Spot, 'lastConfirmedAt'>, now: Date = new Date()): string {
  const ago = timeAgo(spot.lastConfirmedAt ?? null, now);
  return ago ? `Confirmed ${ago}` : 'Not confirmed by a camper yet';
}

/** How a check-in reads in the list. */
export function checkinLabel(checkin: Pick<Checkin, 'kind'>): string {
  return checkin.kind === 'still_good' ? 'Still good' : CHANGE_LABELS[checkin.kind];
}

/** The spot as it shows right after this camper's check-in, before the server's copy loads. */
export function withCheckin(spot: Spot, kind: Checkin['kind'], at: string): Spot {
  if (kind === 'still_good') {
    const { alerts: _alerts, ...rest } = spot;
    return { ...rest, lastConfirmedAt: at, reportCount: spot.reportCount + 1 };
  }
  return { ...spot, alerts: [{ kind, at }, ...(spot.alerts ?? [])].slice(0, 3), reportCount: spot.reportCount + 1 };
}

/**
 * The signed-in camper's latest "Still good" on a spot: undefined while it
 * loads (or signed out), null for none. Loads again when the spot's check-ins
 * change. `set` shows a new one right away.
 */
export function useMyConfirmation(spot: Pick<Spot, 'id' | 'reportCount'> | undefined) {
  const { client, user } = useAuth();
  const spotId = spot?.id;
  const userId = user?.id;
  const key = client && userId && spotId ? `${userId}:${spotId}` : null;
  const [state, setState] = useState<{ key: string; value: MyConfirmation | null } | null>(null);
  // A check-in from this phone (or a reload) changes it: load again then.
  const reportCount = spot?.reportCount;

  const load = useCallback(() => {
    if (!client || !userId || !spotId) return () => undefined;
    const loading = `${userId}:${spotId}`;
    let active = true;
    myLastConfirmation(client, spotId, userId).then(
      (value) => {
        if (active) setState({ key: loading, value });
      },
      // Without signal the button stays; the server still holds the 30 days.
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [client, userId, spotId]);

  useEffect(() => load(), [load, reportCount]);

  const mine = key && state?.key === key ? state.value : undefined;
  const set = useCallback(
    (value: MyConfirmation | null) => {
      if (key) setState({ key, value });
    },
    [key],
  );
  return { mine, set, reload: load };
}

export function SpotCheckins({ spot }: { spot: Spot }) {
  const { client, user } = useAuth();
  const { saveLocal } = useSpots();
  const canPost = usePostingGate();
  const [checkins, setCheckins] = useState<Checkin[] | null>(null);
  const [sending, setSending] = useState(false);
  const { mine, set: setMine, reload: reloadMine } = useMyConfirmation(spot);

  const load = useCallback(() => {
    if (!client) return () => undefined;
    let active = true;
    // Shown when it loads; without signal, the confirmed date above still shows.
    listCheckins(client, spot.id).then(
      (list) => {
        if (active) setCheckins(list);
      },
      () => {
        if (active) setCheckins([]);
      },
    );
    return () => {
      active = false;
    };
  }, [client, spot.id]);

  useEffect(() => load(), [load, user?.id, spot.reportCount]);

  if (!client) return null;

  const stillGood = async () => {
    if (!canPost(`/spot/${spot.id}`)) return;
    setSending(true);
    try {
      const at = new Date().toISOString();
      await sendCheckin(client, spot.id, 'still_good');
      setMine({ at, withdrawn: false });
      saveLocal(withCheckin(spot, 'still_good', at));
      AccessibilityInfo.announceForAccessibility('Thanks! Marked still good.');
    } catch (e) {
      const already = e instanceof CommunityError && e.kind === 'already';
      // Confirmed from another phone, say: show it as done.
      if (already) reloadMine();
      Alert.alert(
        already ? 'Already counted' : "Couldn't send that",
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setSending(false);
    }
  };

  // Taken-back "Still good"s only come to their own camper; the list leaves them out.
  const recent = (checkins ?? []).filter((c) => !c.withdrawn).slice(0, 5);
  const ownSpot = user != null && spot.createdBy === user.id;
  const again = confirmAgainAt(mine);
  const againDay = again ? formatDay(again.toISOString()) : null;

  return (
    <Card>
      <SectionTitle>Were you here?</SectionTitle>
      <Text style={styles.body}>
        {confirmedLabel(spot)}.{' '}
        {ownSpot
          ? 'You added this spot, so other campers confirm it. You can still tell them what changed.'
          : 'Tell other campers how it is now.'}
      </Text>
      <View style={styles.buttons}>
        {ownSpot ? null : mine && again && !mine.withdrawn ? (
          <View style={styles.done}>
            <Ionicons name="checkmark-circle" size={22} color={colors.pine} />
            <Text style={styles.doneText}>
              You said it&apos;s still good {timeAgo(mine.at) ?? 'recently'}. Thanks! If it&apos;s different now, report
              what changed and your &ldquo;Still good&rdquo; is taken back.
            </Text>
          </View>
        ) : mine && again ? (
          <Text style={styles.body}>
            You took back your &ldquo;Still good&rdquo;. You can confirm this spot again on {againDay}.
          </Text>
        ) : (
          <Button
            label="Still good"
            icon="checkmark-circle-outline"
            loading={sending}
            onPress={() => void stillGood()}
          />
        )}
        <Button
          label="Something changed"
          icon="alert-circle-outline"
          kind="secondary"
          disabled={sending}
          onPress={() => {
            if (canPost(`/checkin/${spot.id}`)) router.push({ pathname: '/checkin/[id]', params: { id: spot.id } });
          }}
        />
      </View>
      {checkins == null ? <ActivityIndicator color={colors.pine} accessibilityLabel="Loading check-ins" /> : null}
      {recent.length > 0 ? (
        <View style={styles.list} accessibilityLabel="Recent check-ins">
          {recent.map((c) => (
            <View key={c.id} style={styles.item}>
              <Ionicons
                name={c.kind === 'still_good' ? 'checkmark-circle' : 'alert-circle'}
                size={20}
                color={c.kind === 'still_good' ? colors.pine : colors.orange}
              />
              <View style={styles.itemText}>
                <Text style={styles.itemTitle}>
                  {checkinLabel(c)}
                  <Text style={styles.meta}>
                    {' '}
                    · {c.camperId && c.camperId === user?.id ? 'you' : (c.camperName ?? 'a camper')}
                    {timeAgo(c.createdAt) ? `, ${timeAgo(c.createdAt)}` : ''}
                  </Text>
                </Text>
                {c.note ? <Text style={styles.note}>{c.note}</Text> : null}
              </View>
              {c.camperId == null || c.camperId !== user?.id ? (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/report/[kind]/[id]',
                      params: {
                        kind: 'checkin',
                        id: String(c.id),
                        ...(c.camperId ? { owner: c.camperId } : {}),
                        ...(c.camperName ? { name: c.camperName } : {}),
                      },
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Report this check-in${c.camperName ? ` from ${c.camperName}` : ''}`}
                  hitSlop={12}
                  style={({ pressed }) => [styles.report, pressed && styles.pressed]}
                >
                  <Ionicons name="flag-outline" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
  buttons: { gap: 8 },
  done: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.pineTint,
  },
  doneText: { flex: 1, fontSize: 15, color: colors.ink, lineHeight: 21 },
  list: { gap: 10, marginTop: 4 },
  item: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 14, fontWeight: '400', color: colors.muted },
  note: { fontSize: 14, color: colors.body, lineHeight: 20 },
  // Small to look at; hitSlop makes it a full-size target (18 + 2 × 4 padding + 2 × 12 slop = 50).
  report: { padding: 4 },
  pressed: { opacity: 0.6 },
});
