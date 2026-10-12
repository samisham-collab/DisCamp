// Shown in place of a screen that needs a signed-in camper: a sign-in prompt,
// a spinner while the saved sign-in loads, or a note that this version of the
// app has no server.

import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { AuthStatus } from '../lib/auth';
import { colors } from '../theme';
import { EmptyState } from './ui';

/** Null when signed in: render the screen itself. */
export function AccountGate({
  status,
  next,
  action,
  message,
}: {
  status: AuthStatus;
  next: string;
  action: string;
  /** Why signing in helps here. Defaults to the reason for adding spots. */
  message?: string;
}) {
  if (status === 'signed-in') return null;
  return (
    <View style={styles.center}>
      {status === 'loading' ? (
        <ActivityIndicator size="large" color={colors.pine} accessibilityLabel="Checking your sign-in" />
      ) : status === 'disabled' ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={`${action} isn't available`}
          message="This version of DisCamp runs on its starter spots only, so it can't save new spots."
        />
      ) : (
        <EmptyState
          icon="person-circle-outline"
          title="Sign in first"
          message={message ?? `${action} needs an account, so campers know who to thank. Browsing never does.`}
          actionLabel="Sign in"
          onAction={() => router.push({ pathname: '/sign-in', params: { next } })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: colors.bg },
});
