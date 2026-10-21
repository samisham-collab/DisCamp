// Review cleanups (moderators only): the before photo, the after photo and
// the haul shot side by side, how far from the pin the after photo was
// taken, and who sent it. Approve at the size you see (Embers post), or send
// it back with a reason the camper reads. The database checks every review.

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AccountGate } from '@/components/AccountGate';
import { CleanupPhoto, cleanupTitle } from '@/components/Cleanups';
import { ChoiceField, TextField } from '@/components/form';
import { FreePlanCard } from '@/components/FreePlanCard';
import { KeyboardSafe } from '@/components/KeyboardSafe';
import { Banner, Button, Card, EmptyState, Row, Segmented } from '@/components/ui';
import {
  amModerator,
  approveCleanup,
  CLEANUP_SIZE_LABELS,
  CLEANUP_TRIES,
  rejectCleanup,
  reviewQueue,
  type CleanupSize,
  type ReviewItem,
} from '@/data/cleanups';
import { useCleanups } from '@/data/cleanupsStore';
import { CommunityError } from '@/data/community';
import { useAuth } from '@/lib/auth';
import { CLEANUP_EMBERS } from '@/lib/embers';
import { formatDay, timeAgo } from '@/lib/time';
import { colors } from '@/theme';

const SIZE_OPTIONS: readonly { value: CleanupSize; label: string }[] = (['small', 'medium', 'large'] as const).map(
  (value) => ({ value, label: CLEANUP_SIZE_LABELS[value] }),
);

type SendBackReason = 'place' | 'clean' | 'photos' | 'other';

const SEND_BACK: Record<SendBackReason, string> = {
  place: "The after photo doesn't show the same place",
  clean: "The site doesn't look cleaned up yet",
  photos: 'The photos are too dark or blurry to tell',
  other: 'Something else',
};

const SEND_BACK_OPTIONS = (Object.keys(SEND_BACK) as SendBackReason[]).map((value) => ({
  value,
  label: SEND_BACK[value],
}));

/** The reason the camper reads: the choice, plus the note if there is one. */
function sendBackReason(reason: SendBackReason, note: string): string {
  const extra = note.trim();
  if (reason === 'other') return extra;
  return extra ? `${SEND_BACK[reason]}. ${extra}` : SEND_BACK[reason];
}

function ReviewCard({ item, onDone }: { item: ReviewItem; onDone: (id: string) => void }) {
  const { client, user } = useAuth();
  const [size, setSize] = useState<CleanupSize>(item.taskSize);
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState<SendBackReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = async (action: 'approve' | 'reject') => {
    if (!client) return;
    const why = reason ? sendBackReason(reason, note) : '';
    if (action === 'reject' && !why) {
      setError(reason === 'other' ? 'Say what to fix.' : 'Choose why.');
      return;
    }
    setBusy(action);
    setError(null);
    try {
      if (action === 'approve') await approveCleanup(client, item.completionId, size);
      else await rejectCleanup(client, item.completionId, why);
      AccessibilityInfo.announceForAccessibility(action === 'approve' ? 'Approved' : 'Sent back');
      onDone(item.completionId);
    } catch (e) {
      // Someone else reviewed it meanwhile: it's off the list either way.
      if (e instanceof CommunityError && (e.kind === 'already' || e.kind === 'gone')) {
        Alert.alert('Already reviewed', e.message);
        onDone(item.completionId);
        return;
      }
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const who = item.camperName ?? 'A camper';
  const own = item.camperId != null && item.camperId === user?.id;
  const distance =
    item.distanceM == null
      ? 'Not known'
      : `${item.distanceM} m from the pin${item.accuracyM != null ? ` (phone sure to ${Math.round(item.accuracyM)} m)` : ''}`;

  return (
    <Card>
      <Text style={styles.cardTitle} accessibilityRole="header">
        {cleanupTitle({ kind: item.kind, size: item.taskSize })}
        {item.spotName ? ` near ${item.spotName}` : ''}
      </Text>
      <View style={styles.photos}>
        <View style={styles.photo}>
          <Text style={styles.photoLabel}>Before</Text>
          <CleanupPhoto url={item.beforeUrl} label="Before photo" height={120} />
        </View>
        <View style={styles.photo}>
          <Text style={styles.photoLabel}>After</Text>
          <CleanupPhoto url={item.afterUrl} label="After photo" height={120} />
        </View>
        <View style={styles.photo}>
          <Text style={styles.photoLabel}>Haul</Text>
          <CleanupPhoto url={item.haulUrl} label="Haul shot" height={120} />
        </View>
      </View>
      <Row label="Cleaned up by" value={own ? `${who} (you)` : who} />
      <Row
        label="Their record"
        value={`Joined ${formatDay(item.camperJoined) ?? 'recently'} · ${item.camperApproved} approved before`}
      />
      <Row
        label="After photo"
        value={distance}
        tone={item.distanceM != null && item.distanceM > 150 ? 'warn' : undefined}
      />
      <Row label="Try" value={`${item.tries} of ${CLEANUP_TRIES}`} />
      <Row label="Posted by" value={`${item.postedByName ?? 'A camper'}, ${formatDay(item.taskCreatedAt) ?? ''}`} />
      <Row label="Sent" value={timeAgo(item.sentAt) ?? formatDay(item.sentAt) ?? 'Recently'} />
      {item.taskNote ? <Text style={styles.note}>Posted with: {item.taskNote}</Text> : null}
      {item.note ? (
        <Text style={styles.note}>
          From {who}: {item.note}
        </Text>
      ) : null}

      <Segmented options={SIZE_OPTIONS} value={size} onChange={setSize} accessibilityLabel="Size of the cleanup" />
      <Text style={styles.hint}>
        {CLEANUP_SIZE_LABELS[size]} earns {CLEANUP_EMBERS[size]} Embers
        {size !== item.taskSize ? ` (posted as ${CLEANUP_SIZE_LABELS[item.taskSize].toLowerCase()})` : ''}.
      </Text>

      {error ? <Banner tone="error" message={error} announceKey={error} /> : null}
      {sendingBack ? (
        <>
          <ChoiceField
            label="Why send it back?"
            options={SEND_BACK_OPTIONS}
            value={reason}
            onChange={setReason}
            allowNotSure={false}
          />
          <TextField
            label={reason === 'other' ? 'What to fix' : 'More for the camper'}
            value={note}
            onChangeText={setNote}
            hint="They see this, and can send it once more."
            maxLength={200}
            multiline
          />
          <Button
            label="Send back"
            icon="arrow-undo-outline"
            loading={busy === 'reject'}
            disabled={busy !== null}
            onPress={() => void finish('reject')}
          />
          <Button label="Cancel" kind="secondary" disabled={busy !== null} onPress={() => setSendingBack(false)} />
        </>
      ) : (
        <>
          <Button
            label={`Approve: ${CLEANUP_EMBERS[size]} Embers`}
            icon="checkmark-circle-outline"
            loading={busy === 'approve'}
            disabled={busy !== null}
            onPress={() => void finish('approve')}
          />
          <Button
            label="Send back"
            icon="arrow-undo-outline"
            kind="secondary"
            disabled={busy !== null}
            onPress={() => setSendingBack(true)}
          />
        </>
      )}
    </Card>
  );
}

export default function ReviewScreen() {
  const { status, client } = useAuth();
  const { refresh: refreshCleanups } = useCleanups();
  // null while checking; 'unknown' when it couldn't tell (offline, say).
  const [allowed, setAllowed] = useState<boolean | 'unknown' | null>(null);
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [usageKey, setUsageKey] = useState(0);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const list = await reviewQueue(client);
      setItems(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load cleanups to review.");
    }
  }, [client]);

  /** Checks the camper is a moderator, then loads what waits. Returns a cancel. */
  const checkAndLoad = useCallback(() => {
    if (!client) return undefined;
    let active = true;
    void amModerator(client).then((yes) => {
      if (!active) return;
      setAllowed(yes ?? 'unknown');
      if (yes) void load();
    });
    return () => {
      active = false;
    };
  }, [client, load]);

  useFocusEffect(checkAndLoad);

  if (status !== 'signed-in') return <AccountGate status={status} next="/account" action="Reviewing cleanups" />;
  if (allowed === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.pine} accessibilityLabel="Checking" />
      </View>
    );
  }
  if (allowed === 'unknown') {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't check"
          message="DisCamp couldn't check you're a moderator. Check your signal and try again."
          actionLabel="Try again"
          onAction={() => {
            setAllowed(null);
            checkAndLoad();
          }}
        />
      </View>
    );
  }
  if (!allowed) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="lock-closed-outline"
          title="For moderators"
          message="DisCamp's moderators review cleanups here."
        />
      </View>
    );
  }

  const onRefresh = async () => {
    setRefreshing(true);
    setUsageKey((n) => n + 1);
    await load();
    setRefreshing(false);
  };

  const done = (completionId: string) => {
    setItems((list) => (list ?? []).filter((i) => i.completionId !== completionId));
    void refreshCleanups();
  };

  return (
    <KeyboardSafe>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
      >
        <FreePlanCard refreshKey={usageKey} />
        {error ? (
          <Banner tone="error" message={error} actionLabel="Retry" onAction={() => void load()} announceKey={error} />
        ) : null}
        {items == null && !error ? <ActivityIndicator color={colors.pine} accessibilityLabel="Loading" /> : null}
        {items != null && items.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="All caught up"
            message="No cleanups are waiting for review."
          />
        ) : null}
        {items != null && items.length > 0 ? (
          <Text style={styles.body}>
            {items.length} waiting, oldest first. Approve when the after photo shows the same place, clean, and the haul
            shot matches the size.
          </Text>
        ) : null}
        {(items ?? []).map((item) => (
          <ReviewCard key={item.completionId} item={item} onDone={done} />
        ))}
      </ScrollView>
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: colors.bg },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  photos: { flexDirection: 'row', gap: 8 },
  photo: { flex: 1, gap: 4 },
  photoLabel: { fontSize: 13, fontWeight: '700', color: colors.muted },
  note: { fontSize: 14, color: colors.body, lineHeight: 20 },
  hint: { fontSize: 13, color: colors.muted },
});
