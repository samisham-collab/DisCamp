// "I cleaned it up": an after photo, taken within 150 m of the cleanup's pin,
// and a haul shot of what the camper packed out, both from the camera. It
// goes to a moderator; Embers post once it's approved.

import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AccountGate } from '@/components/AccountGate';
import { cleanupEmbers, cleanupTitle } from '@/components/Cleanups';
import { TextField } from '@/components/form';
import { KeyboardSafe } from '@/components/KeyboardSafe';
import { PausedNotice } from '@/components/PausedNotice';
import { PhotoFixStatus, usePhotoFix } from '@/components/PhotoFix';
import { TermsGate } from '@/components/TermsGate';
import { Banner, Button, Card, EmptyState, SectionTitle } from '@/components/ui';
import { MAX_CLEANUP_NOTE, sendCleanup } from '@/data/cleanups';
import { useCleanups } from '@/data/cleanupsStore';
import { CLEANUP_RADIUS_M } from '@/data/community';
import { useAuth } from '@/lib/auth';
import { takeCameraPhoto } from '@/lib/camera';
import { distanceMeters, distanceMiles, formatDistance } from '@/lib/geo';
import { readPhotoBytes, type PreparedPhoto } from '@/lib/photoPicker';
import { pushPermission, turnOnPush } from '@/lib/push';
import { useDiscardGuard } from '@/lib/useDiscardGuard';
import { useOnce } from '@/lib/useOnce';
import { useStillHere } from '@/lib/useStillHere';
import { hasBlockedWords } from '@/lib/wordFilter';
import { colors, radius } from '@/theme';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/cleanups');
}

/** A photo slot: what to take, the photo once taken, and (re)take. */
function PhotoStep({
  title,
  help,
  photo,
  label,
  busy,
  onTake,
}: {
  title: string;
  help: string;
  photo: PreparedPhoto | null;
  label: string;
  busy: boolean;
  onTake: () => void;
}) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <Text style={styles.body}>{help}</Text>
      {photo ? (
        <Image
          source={{ uri: photo.uri }}
          style={styles.preview}
          contentFit="cover"
          accessible
          accessibilityRole="image"
          accessibilityLabel={label}
        />
      ) : null}
      <Button
        label={`${photo ? 'Retake' : 'Take'} the ${label.toLowerCase()}`}
        icon="camera-outline"
        kind={photo ? 'secondary' : 'primary'}
        disabled={busy}
        onPress={onTake}
      />
    </Card>
  );
}

export default function SendCleanupScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = first(params.id) ?? '';
  const { status, client, user, termsAccepted } = useAuth();
  const { cleanups, upsert, loading, error: loadError, refresh } = useCleanups();
  const location = usePhotoFix();
  const { fix, rough } = location;
  const stillHere = useStillHere();
  // Picked once per photo: a retry after a lost answer never sends it twice,
  // and a retaken photo is never mistaken for an earlier upload.
  const [afterId, setAfterId] = useState(() => Crypto.randomUUID());
  const [haulId, setHaulId] = useState(() => Crypto.randomUUID());
  const [after, setAfter] = useState<PreparedPhoto | null>(null);
  const [haul, setHaul] = useState<PreparedPhoto | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const once = useOnce();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useDiscardGuard(
    !sent && !sending && (after != null || haul != null || note.trim() !== ''),
    'Discard this cleanup?',
    "Your photos haven't been sent.",
  );
  // Back once it's sent (not if the camper already left).
  useEffect(() => {
    if (sent && stillHere()) close();
  }, [sent, stillHere]);

  if (status !== 'signed-in' || !user || !client) {
    // Back here after signing in, with the photos still there.
    return <AccountGate status={status} next={`/cleanup/send/${id}`} action="Sending a cleanup" />;
  }
  if (termsAccepted !== true) return <TermsGate />;
  const task = cleanups.find((t) => t.id === id);
  if (!task) {
    return (
      <View style={styles.center}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.pine} accessibilityLabel="Loading the cleanup" />
        ) : (
          <>
            <EmptyState
              icon={loadError ? 'cloud-offline-outline' : 'leaf-outline'}
              title={loadError ? "Couldn't load the cleanup" : 'Cleanup not found'}
              message={loadError ?? 'It may have been removed.'}
            />
            {loadError ? (
              <Button
                label="Try again"
                icon="refresh"
                loading={retrying}
                onPress={() => {
                  setRetrying(true);
                  void refresh().finally(() => setRetrying(false));
                }}
              />
            ) : null}
            <Button
              label="Back to Cleanups"
              kind={loadError ? 'secondary' : 'primary'}
              onPress={() => router.replace('/cleanups')}
            />
          </>
        )}
      </View>
    );
  }

  const meters = fix && !rough ? distanceMeters(task, fix) : null;
  const tooFar = meters != null && meters > CLEANUP_RADIUS_M;
  const noteError = hasBlockedWords(note) ? "Some words aren't allowed on DisCamp." : null;
  const ready = after != null && haul != null && fix != null && !rough && !location.finding && !tooFar && !noteError;
  // Why "Send" isn't available yet, said to screen-reader users on the button.
  const waitingFor = !after
    ? 'Take the after photo first.'
    : location.finding
      ? 'Waiting for your location.'
      : !fix || rough
        ? 'Needs your location within 75 m.'
        : tooFar
          ? `Go within ${CLEANUP_RADIUS_M} m of the pin and retake the after photo.`
          : !haul
            ? 'Take the haul shot.'
            : noteError;

  const takeAfter = async () => {
    const taken = await takeCameraPhoto('take photos of cleanups');
    if (!taken) return;
    if (after) setAfterId(Crypto.randomUUID());
    setAfter(taken);
    setError(null);
    // Where the after photo was taken is what's checked against the pin: a
    // fix from right now, never an earlier one.
    await location.find();
  };

  const takeHaul = async () => {
    const taken = await takeCameraPhoto('take photos of cleanups');
    if (!taken) return;
    if (haul) setHaulId(Crypto.randomUUID());
    setHaul(taken);
    setError(null);
  };

  const send = async () => {
    if (!after || !haul || !fix || !ready) return;
    setSending(true);
    setError(null);
    try {
      await sendCleanup(
        client,
        { id: afterId, haulId, userId: user.id, taskId: task.id, after, haul, at: fix, note },
        readPhotoBytes,
      );
      upsert({ ...task, status: 'review' });
      AccessibilityInfo.announceForAccessibility('Sent for review');
      // A good moment to offer notifications: there's now a review to hear about.
      const offer = (await pushPermission()) === 'undetermined';
      Alert.alert(
        'Sent for review',
        `Thanks for packing it out! A moderator checks it within a day or two, and your ${cleanupEmbers(task)} Embers post when it's approved.` +
          (offer ? ' Want a notification when it’s reviewed?' : ''),
        offer
          ? [
              { text: 'Not now', style: 'cancel' },
              { text: 'Notify me', onPress: () => void turnOnPush(client, { ask: true }) },
            ]
          : undefined,
      );
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your cleanup. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardSafe>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
      >
        <PausedNotice what="photos" />
        <View style={styles.intro}>
          <Text style={styles.title} accessibilityRole="header">
            You cleaned it up
          </Text>
          <Text style={styles.body}>
            {cleanupTitle(task)}
            {task.spotName ? `, near ${task.spotName}` : ''}. Two photos, taken here, and a moderator does the rest.
          </Text>
        </View>

        <PhotoStep
          title="1. After photo"
          help={`The same place as the before photo, now clean. Take it within ${CLEANUP_RADIUS_M} m of the pin.`}
          photo={after}
          label="After photo"
          busy={sending}
          onTake={() => void takeAfter()}
        />
        {after ? <PhotoFixStatus state={location} purpose="check you're at the cleanup" /> : null}
        {after && fix && !rough && !location.finding ? (
          tooFar ? (
            <Banner
              tone="error"
              icon="location-outline"
              message={`You're ${(meters ?? 0) < 1000 ? `${Math.round(meters ?? 0)} m` : formatDistance(distanceMiles(task, fix))} from the cleanup's pin. Go to it and retake the after photo (within ${CLEANUP_RADIUS_M} m).`}
              announceKey="too-far"
            />
          ) : (
            <Text style={styles.body}>You&apos;re about {Math.round(meters ?? 0)} m from the pin. Good.</Text>
          )
        ) : null}

        <PhotoStep
          title="2. Haul shot"
          help="What you packed out: the bags, the pile in your truck bed. Leave people and license plates out."
          photo={haul}
          label="Haul shot"
          busy={sending}
          onTake={() => void takeHaul()}
        />

        <TextField
          label="Note for the moderator"
          value={note}
          onChangeText={setNote}
          hint="Optional. For example: 3 bags, plus a tire."
          maxLength={MAX_CLEANUP_NOTE}
          error={noteError}
          multiline
        />

        {error ? <Banner tone="error" message={error} announceKey={error} /> : null}
        <Button
          label="Send for review"
          icon="send-outline"
          loading={sending}
          disabled={!ready}
          accessibilityHint={waitingFor ?? undefined}
          onPress={() => once(send)}
        />
        <Button label="Cancel" kind="secondary" disabled={sending} onPress={close} />
      </ScrollView>
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 20, gap: 12, justifyContent: 'center', backgroundColor: colors.bg },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  intro: { gap: 6 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
  preview: { width: '100%', height: 200, borderRadius: radius.md, backgroundColor: colors.lineSoft },
});
