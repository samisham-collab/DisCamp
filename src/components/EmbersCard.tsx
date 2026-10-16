// On Account: the camper's Embers, their rank and how far to the next one,
// today's Embers against the daily limit, what they earned lately, and how
// to earn more. For moderators, a way into the Review screen.

import Ionicons from '@expo/vector-icons/Ionicons';
import type { SupabaseClient } from '@supabase/supabase-js';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { amModerator, listEmbers, myEmbers, type EmberEntry, type EmberSummary } from '../data/cleanups';
import { EARNING_RULES, formatChange, formatEmbers, REASON_LABELS, standingFor } from '../lib/embers';
import { colors, radius, TOUCH_TARGET } from '../theme';
import { Banner, Button, Card, SectionTitle } from './ui';

const RECENT = 10;

function entryLabel(entry: EmberEntry): string {
  const what = REASON_LABELS[entry.reason];
  return entry.spotName ? `${what} · ${entry.spotName}` : what;
}

/** Give it `key={camper id}`, so a different camper starts fresh. */
export function EmbersCard({ client }: { client: SupabaseClient }) {
  const [summary, setSummary] = useState<EmberSummary | null>(null);
  const [recent, setRecent] = useState<EmberEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

  // Each time Account comes into view: Embers post when moderators approve.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([myEmbers(client), listEmbers(client, RECENT)]).then(
        ([s, list]) => {
          if (!active) return;
          setSummary(s);
          setRecent(list);
          setError(null);
        },
        (e: unknown) => {
          if (active) setError(e instanceof Error ? e.message : "Couldn't load your Embers.");
        },
      );
      return () => {
        active = false;
      };
    }, [client]),
  );

  const standing = standingFor(summary?.total ?? 0);

  return (
    <Card>
      <SectionTitle>Embers</SectionTitle>
      {error ? <Banner tone="error" message={error} /> : null}
      {summary == null && !error ? <ActivityIndicator color={colors.pine} accessibilityLabel="Loading Embers" /> : null}
      {summary ? (
        <>
          <View
            style={styles.top}
            accessible
            accessibilityLabel={`${formatEmbers(summary.total)}. ${standing.rank.name}.`}
          >
            <Ionicons
              accessibilityElementsHidden
              importantForAccessibility="no"
              name="flame"
              size={30}
              color={colors.orange}
            />
            <View style={styles.topText}>
              <Text style={styles.total}>{formatEmbers(summary.total)}</Text>
              <Text style={styles.rank}>{standing.rank.name}</Text>
            </View>
          </View>
          <View
            style={styles.bar}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={
              standing.next ? `${formatEmbers(standing.toNext)} to ${standing.next.name}` : 'Top rank reached'
            }
            accessibilityValue={{ min: 0, max: 100, now: Math.round(standing.progress * 100) }}
          >
            <View style={[styles.barFill, { width: `${Math.round(standing.progress * 100)}%` }]} />
          </View>
          <Text style={styles.muted}>
            {standing.next
              ? `${formatEmbers(standing.toNext)} to ${standing.next.name}`
              : 'Guardian: the top rank. Thank you!'}
            {summary.dailyLimit != null ? ` · Today: ${summary.today} of ${summary.dailyLimit}` : ''}
          </Text>
        </>
      ) : null}

      {recent.length > 0 ? (
        <View style={styles.list} accessibilityLabel="Recent Embers">
          {recent.map((entry) => (
            <View key={entry.id} style={styles.entry}>
              <Text style={styles.entryText} numberOfLines={2}>
                {entryLabel(entry)}
                {entry.amount < entry.fullAmount && entry.amount >= 0 ? (
                  <Text style={styles.muted}> (daily limit reached)</Text>
                ) : null}
              </Text>
              <Text style={[styles.amount, entry.amount < 0 && styles.amountDown]}>{formatChange(entry.amount)}</Text>
            </View>
          ))}
        </View>
      ) : summary ? (
        <Text style={styles.body}>No Embers yet. Clean up a site, confirm a spot or add photos to start.</Text>
      ) : null}

      <Pressable
        onPress={() => setShowRules((on) => !on)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showRules }}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      >
        <Text style={styles.link}>How to earn Embers</Text>
        <Ionicons
          accessibilityElementsHidden
          importantForAccessibility="no"
          name={showRules ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.pine}
        />
      </Pressable>
      {showRules ? (
        <View style={styles.list}>
          {EARNING_RULES.map((rule) => (
            <View key={rule.label} style={styles.entry}>
              <Text style={styles.entryText}>{rule.label}</Text>
              <Text style={styles.amount}>{rule.embers}</Text>
            </View>
          ))}
          <Text style={styles.muted}>
            Up to 300 a day (100 a day for your first two weeks), and up to 50 a day from check-ins. Deleting a photo
            takes its Embers back. Embers have no cash value and can&apos;t be bought. Ranks: Tenderfoot, Scout (250),
            Trailblazer (1,000), Pathfinder (3,000), Steward (7,500), Guardian (15,000).
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

/** Shown only to moderators: the way into Review. Give it `key={camper id}` too. */
export function ModeratorCard({ client }: { client: SupabaseClient }) {
  const [moderator, setModerator] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void amModerator(client).then((yes) => {
        if (active) setModerator(yes === true);
      });
      return () => {
        active = false;
      };
    }, [client]),
  );
  if (!moderator) return null;
  return (
    <Card>
      <SectionTitle>Moderator</SectionTitle>
      <Text style={styles.body}>Approve cleanups or send them back, so campers get their Embers.</Text>
      <Button label="Review cleanups" icon="shield-checkmark-outline" onPress={() => router.push('/review')} />
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topText: { gap: 0 },
  total: { fontSize: 24, fontWeight: '800', color: colors.ink },
  rank: { fontSize: 15, fontWeight: '700', color: colors.pine },
  bar: { height: 10, borderRadius: radius.pill, backgroundColor: colors.lineSoft, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.orange },
  muted: { fontSize: 13, color: colors.muted },
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
  list: { gap: 8 },
  entry: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  entryText: { flex: 1, fontSize: 15, color: colors.ink },
  amount: { fontSize: 15, fontWeight: '700', color: colors.pine },
  amountDown: { color: colors.red },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: TOUCH_TARGET },
  link: { fontSize: 15, fontWeight: '600', color: colors.pine, textDecorationLine: 'underline' },
  pressed: { opacity: 0.6 },
});
