// Before a camper posts (a photo, a check-in): signed in, and agreed to the
// community rules. Sends them where they need to go, and says whether they
// can carry on.

import { router } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useAuth } from './auth';

/** Shown when a camper taps before their saved sign-in has loaded (a second or so after launch). */
export function stillChecking(): void {
  Alert.alert('One moment', 'DisCamp is still checking your sign-in. Try again in a second.');
}

export function usePostingGate(): (next: string) => boolean {
  const { status, termsAccepted } = useAuth();
  return useCallback(
    (next: string) => {
      if (status === 'disabled') {
        Alert.alert("This isn't available", 'This version of DisCamp runs on its starter spots only.');
        return false;
      }
      // Still loading the saved sign-in, or the profile that says whether
      // the rules were agreed to: don't send a signed-in camper to sign in.
      if (status === 'loading' || (status === 'signed-in' && termsAccepted == null)) {
        stillChecking();
        return false;
      }
      if (status !== 'signed-in') {
        router.push({ pathname: '/sign-in', params: { next } });
        return false;
      }
      if (termsAccepted !== true) {
        router.push('/rules');
        return false;
      }
      return true;
    },
    [status, termsAccepted],
  );
}
