// Root layout: shared providers, the splash screen (held until saved settings
// load, so nothing flickers) and a crash screen that offers a retry.

import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeaderClose } from '@/components/HeaderClose';
import { PushBridge } from '@/components/PushBridge';
import { Button } from '@/components/ui';
import { CleanupsProvider } from '@/data/cleanupsStore';
import { SpotsProvider } from '@/data/spots';
import { TipsProvider } from '@/data/tipsStore';
import { AuthProvider } from '@/lib/auth';
import { initCrashReports } from '@/lib/crashReports';
import { LocationProvider } from '@/lib/location';
import { log } from '@/lib/log';
import { PrefsProvider, usePrefs } from '@/lib/prefs';
import { ServerProvider } from '@/lib/server';
import { RigProvider, useRig } from '@/lib/rig';
import { colors } from '@/theme';

// Before anything renders, so a crash on the first screen is reported too.
initCrashReports();

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Opening a link straight to a spot still puts Explore underneath it, so the
// back button always has somewhere to go.
export const unstable_settings = { anchor: '(tabs)' };

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    log.error('Screen crashed', error);
  }, [error]);

  return (
    <SafeAreaView style={styles.crash}>
      <ScrollView contentContainerStyle={styles.crashContent}>
        <Text style={styles.crashTitle} accessibilityRole="header">
          Something went wrong
        </Text>
        <Text style={styles.crashBody}>
          DisCamp hit an unexpected problem. Your rig and saved spots are safe on this phone.
        </Text>
        {__DEV__ ? <Text style={styles.crashDetail}>{error.message}</Text> : null}
        <Button label="Try again" icon="refresh" onPress={() => void retry()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const SCREEN_OPTIONS = {
  headerTintColor: colors.pine,
  headerTitleStyle: { color: colors.ink },
  contentStyle: { backgroundColor: colors.bg },
};

/**
 * Screens that slide up. On iPhone they get a "Close" button (Android has its
 * back arrow and back button).
 */
const MODAL = {
  presentation: 'modal' as const,
  ...(Platform.OS === 'ios' ? { headerLeft: () => <HeaderClose /> } : {}),
};

function AppStack() {
  const { ready: rigReady } = useRig();
  const { ready: prefsReady } = usePrefs();
  const ready = rigReady && prefsReady;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  // This component re-renders on every rig or preference change (it reads
  // their "ready" flags). Keeping the navigator element the same object lets
  // React skip re-rendering the whole app for each keystroke in the rig name.
  const stack = useMemo(
    () => (
      <Stack screenOptions={SCREEN_OPTIONS}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="spot/[id]" options={{ title: 'Spot details', headerBackTitle: 'Back' }} />
        <Stack.Screen name="spot/new" options={{ title: 'Add a spot', headerBackTitle: 'Back' }} />
        <Stack.Screen name="spot/edit/[id]" options={{ title: 'Edit spot', headerBackTitle: 'Back' }} />
        <Stack.Screen name="route/[id]" options={{ title: 'Route preview', headerBackTitle: 'Back' }} />
        <Stack.Screen name="sign-in" options={{ title: 'Sign in', ...MODAL }} />
        <Stack.Screen name="report/[kind]/[id]" options={{ title: 'Report', ...MODAL }} />
        <Stack.Screen name="checkin/[id]" options={{ title: 'Report a change', ...MODAL }} />
        <Stack.Screen name="rules" options={{ title: 'Community rules', ...MODAL }} />
        <Stack.Screen name="cleanup/[id]" options={{ title: 'Cleanup', headerBackTitle: 'Back' }} />
        <Stack.Screen name="cleanup/new" options={{ title: 'Post a cleanup', ...MODAL }} />
        <Stack.Screen name="cleanup/send/[id]" options={{ title: 'Send your cleanup', ...MODAL }} />
        <Stack.Screen name="review" options={{ title: 'Review cleanups', headerBackTitle: 'Back' }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
      </Stack>
    ),
    [],
  );

  if (!ready) return null;

  return (
    <View style={styles.app} testID="app-ready">
      <StatusBar style="dark" />
      {stack}
      <PushBridge />
    </View>
  );
}

export default function RootLayout() {
  return (
    <ServerProvider>
      <RigProvider>
        <PrefsProvider>
          <LocationProvider>
            <AuthProvider>
              <SpotsProvider>
                <CleanupsProvider>
                  <TipsProvider>
                    <AppStack />
                  </TipsProvider>
                </CleanupsProvider>
              </SpotsProvider>
            </AuthProvider>
          </LocationProvider>
        </PrefsProvider>
      </RigProvider>
    </ServerProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.bg },
  crash: { flex: 1, backgroundColor: colors.bg },
  crashContent: { padding: 24, gap: 16, flexGrow: 1, justifyContent: 'center' },
  crashTitle: { fontSize: 26, fontWeight: '800', color: colors.ink },
  crashBody: { fontSize: 16, color: colors.body, lineHeight: 22 },
  crashDetail: { fontSize: 13, color: colors.red, fontFamily: 'Courier' },
});
