// Sign in with Apple, Google, Microsoft or GitHub. Opens as a sheet over the
// screen that asked for it, and returns there (or to `next`) when done.

import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LinkRow } from '@/components/HelpCard';
import { Banner, Button, EmptyState } from '@/components/ui';
import { LEGAL_URLS } from '@/config';
import { useAuth } from '@/lib/auth';
import { canUseNativeApple } from '@/lib/authFlows';
import { AUTH_PROVIDERS, type AuthProviderId } from '@/lib/authProviders';
import { safeNext } from '@/lib/navigation';
import { colors, radius } from '@/theme';

function leave(next: string | null) {
  // Back to the screen that asked for sign-in (or on to `next`): dismissTo
  // returns to it if it's open underneath, and opens it if it isn't.
  if (next) router.dismissTo(next as never);
  else if (router.canGoBack()) router.back();
  else router.replace('/account');
}

export default function SignInScreen() {
  const params = useLocalSearchParams<{ next?: string }>();
  const next = safeNext(params.next);
  const { status, displayName, providers, signIn } = useAuth();
  const [busy, setBusy] = useState<AuthProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Assume the built-in Apple sheet on iPhone; checked properly below.
  const [nativeApple, setNativeApple] = useState(Platform.OS === 'ios');
  // Leave exactly once, however many ways sign-in finishes.
  const left = useRef(false);
  const leaveOnce = () => {
    if (left.current) return;
    left.current = true;
    leave(next);
  };

  useEffect(() => {
    let active = true;
    void canUseNativeApple().then((available) => {
      if (active) setNativeApple(available);
    });
    return () => {
      active = false;
    };
  }, []);

  const onPress = async (provider: AuthProviderId) => {
    if (busy) return;
    setBusy(provider);
    setError(null);
    const result = await signIn(provider);
    setBusy(null);
    if (result.status === 'signed-in') leaveOnce();
    else if (result.status === 'error') setError(result.message);
  };

  if (status === 'disabled') {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Sign-in isn't available"
          message="This version of DisCamp runs on its starter spots only, so signing in and adding spots are turned off."
        />
      </View>
    );
  }

  if (status === 'signed-in') {
    return (
      <View style={styles.center}>
        {busy ? (
          // Still finishing (Apple's first sign-in also saves the name).
          <ActivityIndicator size="large" color={colors.pine} accessibilityLabel="Finishing sign-in" />
        ) : (
          <EmptyState
            icon="checkmark-circle-outline"
            title={`You're signed in${displayName ? ` as ${displayName}` : ''}`}
            actionLabel="Continue"
            onAction={leaveOnce}
          />
        )}
      </View>
    );
  }

  const shown = AUTH_PROVIDERS.filter((p) => providers.includes(p.id));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <Ionicons name="person-circle-outline" size={56} color={colors.pine} />
        <Text style={styles.title} accessibilityRole="header">
          Sign in to DisCamp
        </Text>
        <Text style={styles.body}>
          Sign in to add campsites and fix the ones you&apos;ve added. Browsing spots never needs an account.
        </Text>
      </View>

      {error ? <Banner tone="error" message={error} announceKey={error} /> : null}

      <View style={styles.buttons}>
        {shown.map((p) =>
          p.id === 'apple' && nativeApple ? (
            <AppleAuthentication.AppleAuthenticationButton
              key={p.id}
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={radius.md}
              style={[styles.appleButton, busy !== null && styles.dimmed]}
              onPress={() => void onPress('apple')}
            />
          ) : (
            <Button
              key={p.id}
              label={`Continue with ${p.label}`}
              icon={p.icon}
              kind="secondary"
              loading={busy === p.id}
              disabled={busy !== null && busy !== p.id}
              onPress={() => void onPress(p.id)}
            />
          ),
        )}
        {shown.length === 0 ? (
          <Text style={styles.body}>No sign-in options are turned on in this version of the app.</Text>
        ) : null}
      </View>

      <Text style={styles.fine}>
        Your display name shows on spots you add, and you can change it any time. Your email address is never shown. By
        continuing, you agree to DisCamp&apos;s terms of use and privacy policy.
      </Text>
      <View style={styles.legal}>
        <LinkRow label="Terms of use" url={LEGAL_URLS.terms} />
        <LinkRow label="Privacy policy" url={LEGAL_URLS.privacy} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 18, paddingBottom: 40 },
  center: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: colors.bg },
  intro: { alignItems: 'center', gap: 8, paddingTop: 8 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  body: { fontSize: 16, color: colors.body, textAlign: 'center', lineHeight: 22 },
  buttons: { gap: 12 },
  appleButton: { height: 50, width: '100%' },
  dimmed: { opacity: 0.4 },
  fine: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  legal: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
});
