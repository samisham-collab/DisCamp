// Post a cleanup: a before photo from the camera, pinned where the camper
// stands (and linked to a spot within 2 km), what it is, how big, and an
// optional note. Opened from Cleanups, or from a spot's page (?spot=id).

import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AccountGate } from '@/components/AccountGate';
import { ChoiceField, TextField } from '@/components/form';
import { KeyboardSafe } from '@/components/KeyboardSafe';
import { PausedNotice } from '@/components/PausedNotice';
import { PhotoFixStatus, usePhotoFix } from '@/components/PhotoFix';
import { TermsGate } from '@/components/TermsGate';
import { Banner, Button, Card, SectionTitle } from '@/components/ui';
import {
  CLEANUP_KIND_OPTIONS,
  CLEANUP_SIZE_OPTIONS,
  MAX_CLEANUP_NOTE,
  postCleanup,
  SPOT_LINK_RADIUS_M,
  type CleanupKind,
  type CleanupSize,
} from '@/data/cleanups';
import { useCleanups } from '@/data/cleanupsStore';
import { useSpots } from '@/data/spots';
import { useAuth } from '@/lib/auth';
import { takeCameraPhoto } from '@/lib/camera';
import { CLEANUP_EMBERS } from '@/lib/embers';
import { distanceMeters, distanceMiles, formatDistance, nearestWithin } from '@/lib/geo';
import { readPhotoBytes, type PreparedPhoto } from '@/lib/photoPicker';
import { useDiscardGuard } from '@/lib/useDiscardGuard';
import { useOnce } from '@/lib/useOnce';
import { useStillHere } from '@/lib/useStillHere';
import { hasBlockedWords } from '@/lib/wordFilter';
import type { Fix } from '@/types';
import { colors, radius } from '@/theme';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/cleanups');
}

/** "±12 m", when the phone says how sure it is. */
const plusMinus = (fix: Fix) =>
  fix.accuracy != null && Number.isFinite(fix.accuracy) ? ` (within about ${Math.round(fix.accuracy)} m)` : '';

export default function NewCleanupScreen() {
  const params = useLocalSearchParams<{ spot?: string | string[] }>();
  const asked = first(params.spot);
  const { status, client, user, termsAccepted } = useAuth();
  const { spots } = useSpots();
  const { upsert } = useCleanups();
  const location = usePhotoFix();
  const { fix, rough } = location;
  const stillHere = useStillHere();
  // Picked once per photo, so trying again after a lost answer never posts
  // it twice (and a new photo is never mistaken for an old upload).
  const [id, setId] = useState(() => Crypto.randomUUID());
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [kind, setKind] = useState<CleanupKind>('litter');
  const [size, setSize] = useState<CleanupSize>('small');
  const [note, setNote] = useState('');
  const [posting, setPosting] = useState(false);
  const once = useOnce();
  const [error, setError] = useState<string | null>(null);
  // The posted cleanup's id, once it's posted: then on to its page.
  const [postedId, setPostedId] = useState<string | null>(null);

  useDiscardGuard(
    postedId == null && !posting && (photo != null || note.trim() !== ''),
    'Discard this cleanup?',
    "Your photo and details haven't been posted.",
  );
  useEffect(() => {
    if (postedId && stillHere()) router.replace({ pathname: '/cleanup/[id]', params: { id: postedId } });
  }, [postedId, stillHere]);

  if (status !== 'signed-in' || !user || !client) {
    // Back here after signing in, with the photo and location still there.
    return <AccountGate status={status} next="/cleanup/new" action="Posting a cleanup" />;
  }
  if (termsAccepted !== true) return <TermsGate />;

  // The spot it's linked to: the one it was opened from if that's within
  // 2 km, otherwise the nearest within 2 km.
  const visible = spots.filter((s) => !s.hidden);
  const askedSpot = asked ? visible.find((s) => s.id === asked) : undefined;
  const linked = fix
    ? askedSpot && distanceMeters(askedSpot, fix) <= SPOT_LINK_RADIUS_M
      ? askedSpot
      : nearestWithin(visible, fix, SPOT_LINK_RADIUS_M)
    : (askedSpot ?? null);
  const farFromAsked = fix && askedSpot && linked !== askedSpot ? askedSpot : null;
  const noteError = hasBlockedWords(note) ? "Some words aren't allowed on DisCamp." : null;

  const takeBefore = async () => {
    const taken = await takeCameraPhoto('take photos of cleanups');
    if (!taken) return;
    if (photo) setId(Crypto.randomUUID());
    setPhoto(taken);
    setError(null);
    // Where the photo was taken pins the cleanup: a fix from right now, never
    // an earlier one.
    await location.find();
  };

  // Why "Post" isn't available yet, said to screen-reader users on the button.
  const waitingFor = !photo
    ? 'Take the before photo first.'
    : location.finding
      ? 'Waiting for your location.'
      : !fix || rough
        ? 'Needs your location within 75 m.'
        : null;

  const post = async () => {
    if (!photo || !fix || rough || location.finding || noteError) {
      AccessibilityInfo.announceForAccessibility(noteError ?? waitingFor ?? 'Take the before photo first.');
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const posted = await postCleanup(
        client,
        {
          id,
          userId: user.id,
          photo,
          at: fix,
          kind,
          size,
          note,
          ...(linked ? { spotId: linked.id } : {}),
        },
        readPhotoBytes,
      );
      upsert(posted);
      AccessibilityInfo.announceForAccessibility('Cleanup posted');
      setPostedId(posted.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post the cleanup. Please try again.");
    } finally {
      setPosting(false);
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
            Post a cleanup
          </Text>
          <Text style={styles.body}>
            Take the before photo where the trash is: the cleanup is pinned where you stand. Leave people and license
            plates out.
          </Text>
        </View>

        <Card>
          <SectionTitle>Before photo</SectionTitle>
          {photo ? (
            <Image
              source={{ uri: photo.uri }}
              style={styles.preview}
              contentFit="cover"
              accessible
              accessibilityRole="image"
              accessibilityLabel="Your before photo"
            />
          ) : null}
          <Button
            label={photo ? 'Retake the photo' : 'Take the before photo'}
            icon="camera-outline"
            kind={photo ? 'secondary' : 'primary'}
            disabled={posting}
            onPress={() => void takeBefore()}
          />
          {photo ? <PhotoFixStatus state={location} purpose="pin the cleanup" /> : null}
          {photo && fix && !rough && !location.finding ? (
            <Text style={styles.body}>
              Pinned where you are{plusMinus(fix)}.{linked ? ` Near ${linked.name}.` : ''}
            </Text>
          ) : null}
          {farFromAsked && !rough ? (
            <Text style={styles.body}>
              You&apos;re {formatDistance(distanceMiles(farFromAsked, fix as Fix))} from {farFromAsked.name}, so this
              cleanup won&apos;t be linked to it.
            </Text>
          ) : null}
        </Card>

        <ChoiceField
          label="What is it?"
          options={CLEANUP_KIND_OPTIONS}
          value={kind}
          onChange={(value) => setKind(value ?? 'litter')}
          allowNotSure={false}
        />
        <ChoiceField
          label="How big?"
          options={CLEANUP_SIZE_OPTIONS}
          value={size}
          onChange={(value) => setSize(value ?? 'small')}
          allowNotSure={false}
          hint={`Whoever cleans it up earns ${CLEANUP_EMBERS.small}, ${CLEANUP_EMBERS.medium} or ${CLEANUP_EMBERS.large} Embers. A moderator checks the size.`}
        />
        <TextField
          label="Note"
          value={note}
          onChangeText={setNote}
          hint="Optional. For example: behind the fire ring, bring gloves."
          maxLength={MAX_CLEANUP_NOTE}
          error={noteError}
          multiline
        />

        {error ? <Banner tone="error" message={error} announceKey={error} /> : null}
        <Button
          label="Post the cleanup"
          icon="send-outline"
          loading={posting}
          disabled={waitingFor != null}
          accessibilityHint={waitingFor ?? undefined}
          onPress={() => once(post)}
        />
        <Button label="Cancel" kind="secondary" disabled={posting} onPress={close} />
      </ScrollView>
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  intro: { gap: 6 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
  preview: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.lineSoft },
});
