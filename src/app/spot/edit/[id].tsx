// Edit a spot you added. Saving clears its "confirmed" status on the server
// until campers check it again.

import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AccountGate } from '@/components/AccountGate';
import { SpotForm } from '@/components/SpotForm';
import { SpotMissing } from '@/components/SpotMissing';
import { TermsGate } from '@/components/TermsGate';
import { EmptyState } from '@/components/ui';
import { useSpot, useSpots } from '@/data/spots';
import { SpotWriteError, updateSpot } from '@/data/spotWrites';
import { useAuth } from '@/lib/auth';
import {
  draftFromSpot,
  emptyDraft,
  nearbySpot,
  parseCoordinates,
  type SpotDraft,
  type SpotInput,
} from '@/lib/spotDraft';
import { useSpotEditor } from '@/lib/useSpotEditor';
import { useStillHere } from '@/lib/useStillHere';
import { colors } from '@/theme';

/** Stands in until the spot loads, so the editor always has a draft to check. */
const EMPTY = emptyDraft();

export default function EditSpotScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { status, user, client, termsAccepted, reloadProfile } = useAuth();
  const { spot, loading } = useSpot(id);
  const { spots, saveLocal } = useSpots();
  // Starts from the spot as it is; null until the camper changes something.
  const [changes, setChanges] = useState<SpotDraft | null>(null);
  const original = useMemo(() => (spot ? draftFromSpot(spot) : null), [spot]);
  const draft = changes ?? original;

  const save = useCallback(
    (input: SpotInput) => {
      if (!client || !id)
        return Promise.reject(new SpotWriteError('Editing spots needs the DisCamp server.', 'server'));
      return updateSpot(client, id, input);
    },
    [client, id],
  );
  const editor = useSpotEditor(draft ?? EMPTY, save, reloadProfile);
  const stillHere = useStillHere();
  const navigation = useNavigation();
  // The spot's id once saved: then leaving is fine, and the screen goes back to it.
  const [savedId, setSavedId] = useState<string | null>(null);

  // Back, a swipe or Android's back button with unsaved changes: ask first.
  usePreventRemove(changes != null && savedId == null, ({ data }) => {
    Alert.alert('Discard your changes?', "Your edits to this spot haven't been saved.", [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  // Back to the spot's page: the one underneath, or a fresh one if this
  // screen was opened from a link. Not if the camper already left.
  useEffect(() => {
    if (savedId && stillHere()) router.dismissTo({ pathname: '/spot/[id]', params: { id: savedId } });
  }, [savedId, stillHere]);

  const gate = <AccountGate status={status} next={`/spot/edit/${id ?? ''}`} action="Editing a spot" />;
  if (status !== 'signed-in') return gate;
  if (termsAccepted !== true) return <TermsGate />;

  if (!spot || !draft) return <SpotMissing loading={loading} />;
  if (spot.createdBy !== user?.id) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="lock-closed-outline"
          title="You can only edit spots you added"
          message="Something wrong with it? Tell other campers with “Something changed” on the spot’s page."
        />
      </View>
    );
  }

  const near = nearbySpot(spots, parseCoordinates(draft.coordinates), spot.id);

  const onSubmit = async () => {
    const saved = await editor.submit();
    if (!saved) return;
    saveLocal(saved);
    setSavedId(saved.id);
  };

  return (
    <SpotForm
      draft={draft}
      onChange={(patch) => {
        editor.edited();
        // From the latest draft, not this render's: "Use my location" can
        // answer while the camper is still typing.
        setChanges((prev) => ({ ...(prev ?? draft), ...patch }));
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
      submitLabel="Save changes"
      onSubmit={() => void onSubmit()}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: colors.bg },
});
