// A spot's photos: a strip of thumbnails, "Add a photo" (camera or library),
// and a full-size view with Report, Block or Delete. Photos load when the
// spot opens; they need signal (there's no offline copy of them).

import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  addPhoto,
  CommunityError,
  deletePhoto,
  listPhotos,
  MAX_PHOTOS_PER_SPOT,
  type SpotPhoto,
} from '../data/community';
import { useAuth } from '../lib/auth';
import { log } from '../lib/log';
import { pickPhoto, readPhotoBytes, type PhotoSource, type PreparedPhoto } from '../lib/photoPicker';
import { formatDay } from '../lib/time';
import { useBlockCamper } from '../lib/useBlockCamper';
import { usePostingGate } from '../lib/usePostingGate';
import type { Spot } from '../types';
import { colors, TOUCH_TARGET } from '../theme';
import { Button, Card, SectionTitle } from './ui';

const THUMB = 112;
/** iOS can't open the next screen until the photo view has closed; this is the longest that takes. */
const CLOSE_MS = Platform.OS === 'ios' ? 700 : 0;

export function SpotPhotos({ spot }: { spot: Spot }) {
  const { client, user } = useAuth();
  const canPost = usePostingGate();
  const [photos, setPhotos] = useState<SpotPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // The photo in the full-size view. It stays set while the view closes.
  const [open, setOpen] = useState<SpotPhoto | null>(null);
  const [viewing, setViewing] = useState(false);
  const afterClose = useRef<(() => void) | null>(null);

  const finishClose = useCallback(() => {
    const next = afterClose.current;
    afterClose.current = null;
    next?.();
  }, []);

  /** Closes the full-size view, then (once it's gone) does `then`. */
  const closeViewer = (then?: () => void) => {
    afterClose.current = then ?? null;
    setViewing(false);
    // iOS says when it's gone (onDismiss); this covers Android, and iOS if it doesn't.
    setTimeout(finishClose, CLOSE_MS);
  };

  const load = useCallback(() => {
    if (!client) return () => undefined;
    let active = true;
    listPhotos(client, spot.id).then(
      (list) => {
        if (!active) return;
        setPhotos(list);
        setError(null);
      },
      (e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Couldn't load the photos.");
      },
    );
    return () => {
      active = false;
    };
  }, [client, spot.id]);

  // Again after signing in or out: your own hidden photos, and blocks, change what shows.
  useEffect(() => load(), [load, user?.id]);

  // Without a server, starter spots have no photos to show.
  if (!client) return null;

  const mine = photos?.filter((p) => user != null && p.createdBy === user.id).length ?? 0;
  const full = mine >= MAX_PHOTOS_PER_SPOT;

  const add = async (source: PhotoSource) => {
    if (!user) return;
    let picked;
    try {
      picked = await pickPhoto(source);
    } catch (e) {
      log.warn('Could not get a photo', { error: e instanceof Error ? e.message : String(e) });
      Alert.alert("Couldn't open that photo", 'Try another one.');
      return;
    }
    if (picked.status === 'cancelled') return;
    if (picked.status === 'denied') {
      Alert.alert('Camera is off for DisCamp', 'Allow the camera in Settings to take photos of spots.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    await send(user.id, picked.photo, Crypto.randomUUID());
  };

  /** Sends a photo. Trying again keeps its id, so a photo that did arrive isn't added twice. */
  const send = async (userId: string, photo: PreparedPhoto, id: string) => {
    setAdding(true);
    try {
      const added = await addPhoto(client, { spotId: spot.id, id, userId, photo }, readPhotoBytes);
      setPhotos((list) => [...(list ?? []).filter((p) => p.id !== added.id), added]);
      AccessibilityInfo.announceForAccessibility('Photo added');
    } catch (e) {
      const canRetry = !(e instanceof CommunityError) || ['offline', 'timeout', 'server'].includes(e.kind);
      Alert.alert(
        "Couldn't add the photo",
        e instanceof Error ? e.message : 'Please try again.',
        canRetry
          ? [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Try again', onPress: () => void send(userId, photo, id) },
            ]
          : undefined,
      );
    } finally {
      setAdding(false);
    }
  };

  const onAdd = () => {
    if (!canPost(`/spot/${spot.id}`)) return;
    Alert.alert('Add a photo', 'Show the site, the road in, or the view. Leave people and license plates out.', [
      { text: 'Take a photo', onPress: () => void add('camera') },
      { text: 'Choose from library', onPress: () => void add('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Card>
      <SectionTitle>Photos</SectionTitle>
      {photos == null && !error ? <ActivityIndicator color={colors.pine} accessibilityLabel="Loading photos" /> : null}
      {error ? (
        <View style={styles.errorRow}>
          <Text style={styles.muted}>{error}</Text>
          <Pressable
            onPress={() => {
              setError(null);
              load();
            }}
            accessibilityRole="button"
            style={styles.retry}
          >
            <Text style={styles.link}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      {photos && photos.length === 0 ? <Text style={styles.muted}>No photos yet. Be the first to add one.</Text> : null}
      {photos && photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {photos.map((photo, i) => (
            <Pressable
              key={photo.id}
              onPress={() => {
                setOpen(photo);
                setViewing(true);
              }}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Photo ${i + 1} of ${photos.length}${photo.addedBy ? `, by ${photo.addedBy}` : ''}`}
              accessibilityHint="Opens it full size"
            >
              <Image source={{ uri: photo.url }} style={styles.thumb} contentFit="cover" transition={150} />
              {photo.hidden ? (
                <View style={styles.hiddenTag}>
                  <Ionicons name="eye-off-outline" size={14} color="#FFFFFF" />
                </View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {full ? (
        <Text style={styles.muted}>You&apos;ve added {MAX_PHOTOS_PER_SPOT} photos here, the most for one camper.</Text>
      ) : (
        <Button label="Add a photo" icon="camera-outline" kind="secondary" loading={adding} onPress={onAdd} />
      )}
      <PhotoViewer
        photo={open}
        visible={viewing}
        spot={spot}
        mine={open != null && user != null && open.createdBy === user.id}
        onClose={closeViewer}
        onDismiss={finishClose}
        onDeleted={(id) => {
          closeViewer();
          setPhotos((list) => (list ?? []).filter((p) => p.id !== id));
        }}
        onBlocked={(camperId) => {
          closeViewer();
          setPhotos((list) => (list ?? []).filter((p) => p.createdBy !== camperId));
        }}
      />
    </Card>
  );
}

function PhotoViewer({
  photo,
  visible,
  spot,
  mine,
  onClose,
  onDismiss,
  onDeleted,
  onBlocked,
}: {
  photo: SpotPhoto | null;
  visible: boolean;
  spot: Spot;
  mine: boolean;
  /** Closes the view, then does `then` once it's gone. */
  onClose: (then?: () => void) => void;
  onDismiss: () => void;
  onDeleted: (id: string) => void;
  onBlocked: (camperId: string) => void;
}) {
  const { client } = useAuth();
  const { block, busy: blocking } = useBlockCamper();
  const [deleting, setDeleting] = useState(false);
  if (!photo) return null;

  const by = mine ? 'you' : (photo.addedBy ?? 'a camper');
  const on = formatDay(photo.createdAt);

  const onDelete = () => {
    Alert.alert('Delete this photo?', 'It comes off the spot for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (!client) return;
          setDeleting(true);
          void deletePhoto(client, photo).then(
            () => {
              setDeleting(false);
              AccessibilityInfo.announceForAccessibility('Photo deleted');
              onDeleted(photo.id);
            },
            (e: unknown) => {
              setDeleting(false);
              Alert.alert("Couldn't delete the photo", e instanceof Error ? e.message : 'Please try again.');
            },
          );
        },
      },
    ]);
  };

  const onReport = () => {
    const params = {
      kind: 'photo',
      id: photo.id,
      ...(photo.createdBy ? { owner: photo.createdBy } : {}),
      ...(photo.addedBy ? { name: photo.addedBy } : {}),
    };
    onClose(() => router.push({ pathname: '/report/[kind]/[id]', params }));
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={() => onClose()}
      onDismiss={onDismiss}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.viewer}>
        <Image
          source={{ uri: photo.url }}
          style={styles.full}
          contentFit="contain"
          accessibilityLabel={`Photo of ${spot.name}, added by ${by}`}
        />
        <View style={styles.viewerBar}>
          <Text style={styles.caption}>
            Added by {by}
            {on ? ` on ${on}` : ''}
            {photo.hidden ? ' · hidden while it’s reviewed' : ''}
          </Text>
          <View style={styles.viewerActions}>
            {mine ? (
              <ViewerButton icon="trash-outline" label="Delete" busy={deleting} onPress={onDelete} />
            ) : (
              <>
                <ViewerButton icon="flag-outline" label="Report" onPress={onReport} />
                {photo.createdBy ? (
                  <ViewerButton
                    icon="eye-off-outline"
                    label="Block"
                    busy={blocking}
                    onPress={() => {
                      const camper = { id: photo.createdBy ?? '', name: photo.addedBy ?? null };
                      block(camper, `/spot/${spot.id}`, () => onBlocked(camper.id));
                    }}
                  />
                ) : null}
              </>
            )}
            <ViewerButton icon="close" label="Close" onPress={() => onClose()} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ViewerButton({
  icon,
  label,
  onPress,
  busy = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: busy }}
      style={({ pressed }) => [styles.viewerButton, pressed && styles.pressed]}
    >
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name={icon} size={22} color="#FFFFFF" />}
      <Text style={styles.viewerButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: { gap: 8, paddingVertical: 4 },
  thumb: { width: THUMB, height: THUMB, borderRadius: 10, backgroundColor: colors.lineSoft },
  hiddenTag: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.overlay,
    borderRadius: 10,
    padding: 3,
  },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  retry: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
  link: { fontSize: 15, fontWeight: '700', color: colors.pine, textDecorationLine: 'underline' },
  viewer: { flex: 1, backgroundColor: '#000000' },
  full: { flex: 1 },
  viewerBar: { padding: 16, paddingBottom: 32, gap: 12, backgroundColor: 'rgba(0, 0, 0, 0.75)' },
  caption: { color: '#FFFFFF', fontSize: 15 },
  viewerActions: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', gap: 8 },
  viewerButton: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  viewerButtonText: { color: '#FFFFFF', fontSize: 13, marginTop: 2 },
  pressed: { opacity: 0.6 },
});
