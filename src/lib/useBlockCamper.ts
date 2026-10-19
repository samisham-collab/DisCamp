// "Block": asks first, then hides every spot from that camper for you, right
// away and on the server. Shared by the spot page and the report screen.

import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';

import { useCleanups } from '../data/cleanupsStore';
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
  const { refresh: refreshCleanups } = useCleanups();
  const [busy, setBusy] = useState(false);

  /**
   * `next` is where sign-in returns to, if the camper isn't signed in. `after`
   * runs once blocked. `openSignIn` opens sign-in instead of going straight
   * there: a full-screen photo has to close first, or sign-in opens behind it.
   */
  const block = useCallback(
    (camper: CamperRef, next: string, after?: () => void, openSignIn?: (go: () => void) => void) => {
      if (status === 'disabled' || !client) {
        Alert.alert("Blocking isn't available", 'This version of DisCamp runs on its starter spots only.');
        return;
      }
      if (status !== 'signed-in') {
        Alert.alert('Sign in to block campers', 'Blocking needs an account, so it follows you to every phone.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign in',
            onPress: () => {
              const go = () => router.push({ pathname: '/sign-in', params: { next } });
              if (openSignIn) openSignIn(go);
              else go();
            },
          },
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
                  // Their cleanups disappear for you too.
                  void refreshCleanups();
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
    [client, status, removeByCreator, refresh, refreshCleanups],
  );

  return { block, busy };
}
