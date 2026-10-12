// Add a spot. The draft is saved on the phone as the camper types, so
// leaving the screen (or losing signal) never loses it.

import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useCallback, useRef } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { AccountGate } from '@/components/AccountGate';
import { SpotForm } from '@/components/SpotForm';
import { TermsGate } from '@/components/TermsGate';
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
import { useStillHere } from '@/lib/useStillHere';
import { colors } from '@/theme';

const EMPTY = emptyDraft();
const keepDraft = (d: SpotDraft) => d;

export default function NewSpotScreen() {
  const { status, user, client, termsAccepted, reloadProfile } = useAuth();
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
  const editor = useSpotEditor(draft, save, reloadProfile);
  const stillHere = useStillHere();

  const gate = <AccountGate status={status} next="/spot/new" action="Adding a spot" />;
  if (status !== 'signed-in') return gate;
  if (termsAccepted !== true) return <TermsGate />;
  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.pine} />
      </View>
    );
  }

  const near = nearbySpot(spots, parseCoordinates(draft.coordinates));

  const onSubmit = async () => {
    const me = user?.id ?? '';
    // A retry (even after a restart) reuses the draft's id, unless another
    // camper on this phone picked it.
    if (draft.clientId && (draft.ownerId === me || draft.ownerId === '')) {
      spotId.current = draft.clientId;
    } else {
      const id = Crypto.randomUUID();
      // Saved with the draft, so the next retry finds it.
      updateDraft((d) => ({ ...d, clientId: id, ownerId: me }));
      spotId.current = id;
    }
    const spot = await editor.submit();
    if (!spot) return;
    saveLocal(spot);
    // Cleared even if the camper already left, so the next spot starts fresh.
    updateDraft(emptyDraft());
    if (stillHere()) router.replace({ pathname: '/spot/[id]', params: { id: spot.id } });
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
