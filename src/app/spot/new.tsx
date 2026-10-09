// Add a spot. The draft is saved on the phone as the camper types, so
// leaving the screen (or losing signal) never loses it.

import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useCallback, useRef } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { AccountGate } from '@/components/AccountGate';
import { SpotForm } from '@/components/SpotForm';
import { STORAGE_KEYS } from '@/config';
import { useSpots } from '@/data/spots';
import { createSpot, SpotWriteError } from '@/data/spotWrites';
import { useAuth } from '@/lib/auth';
import {
  emptyDraft,
  isBlankDraft,
  nearbySpot,
  parseCoordinates,
  storedDraftSchema,
  type SpotDraft,
  type SpotInput,
} from '@/lib/spotDraft';
import { usePersistentState } from '@/lib/usePersistentState';
import { useSpotEditor } from '@/lib/useSpotEditor';
import { colors } from '@/theme';

const EMPTY = emptyDraft();
const keepDraft = (d: SpotDraft) => d;

export default function NewSpotScreen() {
  const { status, client } = useAuth();
  const { spots, saveLocal } = useSpots();
  const [draft, updateDraft, ready] = usePersistentState(STORAGE_KEYS.spotDraft, storedDraftSchema, EMPTY, keepDraft);

  // Set just before each try to save; see SpotDraft.clientId.
  const spotId = useRef('');
  const save = useCallback(
    (input: SpotInput) => {
      if (!client) return Promise.reject(new SpotWriteError('Adding spots needs the DisCamp server.', 'server'));
      return createSpot(client, input, spotId.current);
    },
    [client],
  );
  const editor = useSpotEditor(draft, save);

  const gate = <AccountGate status={status} next="/spot/new" action="Adding a spot" />;
  if (status !== 'signed-in') return gate;
  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.pine} />
      </View>
    );
  }

  const near = nearbySpot(spots, parseCoordinates(draft.coordinates));

  const onSubmit = async () => {
    if (!draft.clientId) {
      const id = Crypto.randomUUID();
      // Saved with the draft, so a retry (even after a restart) reuses it.
      updateDraft((d) => ({ ...d, clientId: d.clientId || id }));
      spotId.current = id;
    } else {
      spotId.current = draft.clientId;
    }
    const spot = await editor.submit();
    if (!spot) return;
    saveLocal(spot);
    updateDraft(emptyDraft());
    router.replace({ pathname: '/spot/[id]', params: { id: spot.id } });
  };

  const onDiscard = () => {
    Alert.alert('Discard this draft?', 'Everything you entered for this spot will be cleared.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => updateDraft(emptyDraft()) },
    ]);
  };

  return (
    <SpotForm
      draft={draft}
      onChange={(patch) => {
        editor.edited();
        updateDraft((d) => ({ ...d, ...patch }));
      }}
      errors={editor.errors}
      failedTries={editor.failedTries}
      nearby={
        near
          ? {
              name: near.spot.name,
              miles: near.miles,
              onOpen: () => router.push({ pathname: '/spot/[id]', params: { id: near.spot.id } }),
            }
          : null
      }
      formError={editor.formError}
      saving={editor.saving}
      submitLabel="Add spot"
      onSubmit={() => void onSubmit()}
      onDiscard={isBlankDraft(draft) ? undefined : onDiscard}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
