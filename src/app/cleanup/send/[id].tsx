// "I cleaned it up": an after photo, taken within 150 m of the cleanup's pin,
// and a haul shot of what the camper packed out, both from the camera. It
// goes to a moderator; Embers post once it's approved.

import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AccountGate } from '@/components/AccountGate';
import { cleanupEmbers, cleanupTitle } from '@/components/Cleanups';
import { TextField } from '@/components/form';
import { KeyboardSafe } from '@/components/KeyboardSafe';
import { TermsGate } from '@/components/TermsGate';
import { Banner, Button, Card, EmptyState, SectionTitle } from '@/components/ui';
import { MAX_CLEANUP_NOTE, sendCleanup } from '@/data/cleanups';
import { useCleanups } from '@/data/cleanupsStore';
import { CLEANUP_RADIUS_M, isRoughFix, roughFixMessage } from '@/data/community';
import { useAuth } from '@/lib/auth';
import { takeCameraPhoto } from '@/lib/camera';
import { distanceMeters, distanceMiles, formatDistance } from '@/lib/geo';
import { useLocation } from '@/lib/location';
import { readPhotoBytes, type PreparedPhoto } from '@/lib/photoPicker';
import { pushPermission, turnOnPush } from '@/lib/push';
import { useStillHere } from '@/lib/useStillHere';
import { hasBlockedWords } from '@/lib/wordFilter';
import type { Fix } from '@/types';
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
        <Image source={{ uri: photo.uri }} style={styles.preview} contentFit="cover" accessibilityLabel={label} />
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
  const { cleanups, upsert } = useCleanups();
  const { locate, locating } = useLocation();
  const stillHere = useStillHere();
  // Picked once per photo: a retry after a lost answer never sends it twice,
  // and a retaken photo is never mistaken for an earlier upload.
  const [afterId, setAfterId] = useState(() => Crypto.randomUUID());
  const [haulId, setHaulId] = useState(() => Crypto.randomUUID());
  const [after, setAfter] = useState<PreparedPhoto | null>(null);
  const [haul, setHaul] = useState<PreparedPhoto | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== 'signed-in' || !user || !client) {
    return <AccountGate status={status} next={`/cleanup/${id}`} action="Sending a cleanup" />;
  }
  if (termsAccepted !== true) return <TermsGate />;
  const task = cleanups.find((t) => t.id === id);
  if (!task) {
    return (
      <View style={styles.center}>
        <EmptyState icon="leaf-outline" title="Cleanup not found" message="It may have been removed." />
      </View>
    );
  }

  const rough = isRoughFix(fix);
  const meters = fix && !rough ? distanceMeters(task, fix) : null;
  const tooFar = meters != null && meters > CLEANUP_RADIUS_M;
  const noteError = hasBlockedWords(note) ? "Some words aren't allowed on DisCamp." : null;
  const ready = after != null && haul != null && fix != null && !rough && !tooFar && !noteError;

  const takeAfter = async () => {
    const taken = await takeCameraPhoto('take photos of cleanups');
    if (!taken) return;
    if (after) setAfterId(Crypto.randomUUID());
    setAfter(taken);
    setError(null);
    // Where the after photo was taken is what's checked against the pin: a
    // fix from right now, never an earlier one.
    setFix(null);
    const found = await locate({ fresh: true });
    if (found) setFix(found);
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
      if (stillHere()) close();
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
        {after && fix && rough ? (
          <Banner
            tone="warning"
            icon="location-outline"
            message={roughFixMessage(fix, 'retake the after photo')}
            actionLabel="Settings"
            onAction={() => void Linking.openSettings()}
          />
        ) : after && fix ? (
          tooFar ? (
            <Banner
              tone="error"
              icon="location-outline"
              message={`You're ${(meters ?? 0) < 1000 ? `${Math.round(meters ?? 0)} m` : formatDistance(distanceMiles(task, fix))} from the cleanup's pin. Go to it and retake the after photo (within ${CLEANUP_RADIUS_M} m).`}
            />
          ) : (
            <Text style={styles.body}>You&apos;re about {Math.round(meters ?? 0)} m from the pin. Good.</Text>
          )
        ) : null}
        {after && !fix && !locating ? (
          <Banner
            tone="warning"
            icon="location-outline"
            message="DisCamp needs your location to check you're at the cleanup. Turn location on, then retake the after photo."
          />
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
          onPress={() => void send()}
        />
        <Button label="Cancel" kind="secondary" disabled={sending} onPress={close} />
      </ScrollView>
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: colors.bg },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  intro: { gap: 6 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
  preview: { width: '100%', height: 200, borderRadius: radius.md, backgroundColor: colors.lineSoft },
});
