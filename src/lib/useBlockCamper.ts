// "Block": asks first, then hides every spot from that camper for you, right
// away and on the server. Shared by the spot page and the report screen.

import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';

import { blockCamper } from '../data/moderation';
import { useSpots } from '../data/spots';
import { useAuth } from './auth';

export interface CamperRef {
  id: string;
  /** Their display name, if known. */
  name: string | null;
}

export function useBlockCamper() {
  const { client, status } = useAuth();
  const { removeByCreator, refresh } = useSpots();
  const [busy, setBusy] = useState(false);

  /** `next` is where sign-in returns to, if the camper isn't signed in. `after` runs once blocked. */
  const block = useCallback(
    (camper: CamperRef, next: string, after?: () => void) => {
      if (status === 'disabled' || !client) {
        Alert.alert("Blocking isn't available", 'This version of DisCamp runs on its starter spots only.');
        return;
      }
      if (status !== 'signed-in') {
        Alert.alert('Sign in to block campers', 'Blocking needs an account, so it follows you to every phone.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign in', onPress: () => router.push({ pathname: '/sign-in', params: { next } }) },
        ]);
        return;
      }
      const who = camper.name ?? 'this camper';
      Alert.alert(
        `Block ${who}?`,
        `You won't see spots or photos ${who} adds. They aren't told. You can unblock them any time in Account.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: () => {
              setBusy(true);
              void blockCamper(client, camper.id).then(
                () => {
                  setBusy(false);
                  removeByCreator(camper.id);
                  void refresh();
                  AccessibilityInfo.announceForAccessibility(`${who} blocked`);
                  after?.();
                },
                (error: unknown) => {
                  setBusy(false);
                  Alert.alert("Couldn't block", error instanceof Error ? error.message : 'Please try again.');
                },
              );
            },
          },
        ],
      );
    },
    [client, status, removeByCreator, refresh],
  );

  return { block, busy };
}
