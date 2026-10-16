// On Account: whether this phone gets DisCamp's notifications, and a way to
// turn them on (or to the phone's settings, once the camper said no there).

import type { SupabaseClient } from '@supabase/supabase-js';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AccessibilityInfo, Linking, StyleSheet, Text } from 'react-native';

import { pushPermission, pushUnavailable, turnOnPush, type PushPermission } from '@/lib/push';
import { colors } from '@/theme';
import { Banner, Button, Card, SectionTitle } from './ui';

const WHAT_YOU_HEAR =
  'Get a notification when a moderator reviews a cleanup you sent, and when someone cleans up one you posted.';

export function NotificationsCard({ client }: { client: SupabaseClient }) {
  const unavailable = pushUnavailable();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Again each time Account comes into view: the camper may have changed it in Settings.
  useFocusEffect(
    useCallback(() => {
      if (unavailable) return undefined;
      let active = true;
      void pushPermission().then((p) => {
        if (active) setPermission(p);
      });
      return () => {
        active = false;
      };
    }, [unavailable]),
  );

  if (unavailable === 'web') return null;

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    const result = await turnOnPush(client, { ask: true });
    setBusy(false);
    if (result.status === 'on') {
      setPermission('granted');
      AccessibilityInfo.announceForAccessibility('Notifications on');
    } else if (result.status === 'denied') {
      setPermission('denied');
    } else if (result.status === 'error') {
      setError(result.message);
    }
  };

  return (
    <Card>
      <SectionTitle>Notifications</SectionTitle>
      {error ? <Banner tone="error" message={error} /> : null}
      {unavailable === 'expo-go' ? (
        <Text style={styles.body}>
          Notifications work in the App Store and Google Play versions of DisCamp, not in Expo Go.
        </Text>
      ) : unavailable === 'no-project' ? (
        <Text style={styles.body}>Notifications aren&apos;t set up in this version of DisCamp yet.</Text>
      ) : permission === 'granted' ? (
        <>
          <Text style={styles.body}>On. {WHAT_YOU_HEAR}</Text>
          <Button
            label="Notification settings"
            icon="settings-outline"
            kind="secondary"
            onPress={() => void Linking.openSettings()}
          />
        </>
      ) : permission === 'denied' ? (
        <>
          <Text style={styles.body}>
            Off in your phone&apos;s settings. To hear when your cleanups are reviewed, allow notifications for DisCamp
            there.
          </Text>
          <Button
            label="Open Settings"
            icon="settings-outline"
            kind="secondary"
            onPress={() => void Linking.openSettings()}
          />
        </>
      ) : permission === 'undetermined' ? (
        <>
          <Text style={styles.body}>{WHAT_YOU_HEAR}</Text>
          <Button
            label="Turn on notifications"
            icon="notifications-outline"
            loading={busy}
            onPress={() => void turnOn()}
          />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
});
