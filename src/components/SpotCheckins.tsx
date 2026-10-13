// "Were you here?": one tap for "Still good", or report a change. Shows when
// campers last confirmed the spot and what they've said recently; other
// campers' check-ins can be reported. The camper who added a spot can report
// changes, but other campers confirm it.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { CHANGE_LABELS, CommunityError, listCheckins, sendCheckin, type Checkin } from '../data/community';
import { useSpots } from '../data/spots';
import { useAuth } from '../lib/auth';
import { timeAgo } from '../lib/time';
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

export function SpotCheckins({ spot }: { spot: Spot }) {
  const { client, user } = useAuth();
  const { saveLocal } = useSpots();
  const canPost = usePostingGate();
  const [checkins, setCheckins] = useState<Checkin[] | null>(null);
  const [sending, setSending] = useState(false);

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
      await sendCheckin(client, spot.id, 'still_good');
      saveLocal(withCheckin(spot, 'still_good', new Date().toISOString()));
      AccessibilityInfo.announceForAccessibility('Thanks! Marked still good.');
    } catch (e) {
      const already = e instanceof CommunityError && e.kind === 'already';
      Alert.alert(
        already ? 'Already counted' : "Couldn't send that",
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setSending(false);
    }
  };

  const recent = (checkins ?? []).slice(0, 5);
  const ownSpot = user != null && spot.createdBy === user.id;

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
        {ownSpot ? null : (
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
