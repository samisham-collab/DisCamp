// Build-time settings layered on top of app.json. Only values that come from
// the environment (keys you don't want in git, or that differ per build)
// belong here.
//
// GOOGLE_MAPS_ANDROID_API_KEY: Android store builds draw the map with Google
// Maps, which needs a Google Cloud key with "Maps SDK for Android" on. Without
// it the map is blank on Android. iPhone uses Apple Maps and needs no key, and
// Expo Go needs none either. Add it on expo.dev (your project > Environment
// variables) for every environment you build Android in, or with:
//   eas env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value <key> --environment production --visibility sensitive
//
// EXPO_PUBLIC_SUPPORT_EMAIL: shown in the app (App Review requires a way to
// contact you). A production build stops without it.
//
// EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: a
// production build stops without them too (it would have no server).
//
// SENTRY_ORG and SENTRY_PROJECT (plus the SENTRY_AUTH_TOKEN secret): when
// set, builds upload source maps so crash reports show DisCamp's own code.
// Crash reports themselves only need EXPO_PUBLIC_SENTRY_DSN. See README.
//
// Over-the-air updates: `npx eas-cli@latest init` writes the project id to
// app.json (extra.eas.projectId); updates are on from then on.
//
// Notifications on Android go through Firebase Cloud Messaging, which needs
// the google-services.json file from your Firebase project (MODERATION.md,
// "Notifications"). Put it next to this file, or upload it to expo.dev as a
// file environment variable named GOOGLE_SERVICES_JSON. Without it, Android
// builds work but can't receive notifications.

import { existsSync } from 'fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { AndroidConfig, withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins';

/**
 * Android 7 to 9 only let the camera save the photo it takes with storage
 * access, so "Take a photo" asks for it there. Newer Android never needs it:
 * app.json removes the rest of storage access, and this keeps the one
 * permission for Android 9 and older.
 */
const withOldAndroidCamera: ConfigPlugin = (base) =>
  withAndroidManifest(base, (mod) => {
    AndroidConfig.Manifest.ensureToolsAvailable(mod.modResults);
    const manifest = mod.modResults.manifest;
    const name = 'android.permission.WRITE_EXTERNAL_STORAGE';
    const others = (manifest['uses-permission'] ?? []).filter((p) => p.$['android:name'] !== name);
    const legacy = { 'android:name': name, 'android:maxSdkVersion': '28', 'tools:replace': 'android:maxSdkVersion' };
    manifest['uses-permission'] = [...others, { $: legacy as { 'android:name': string } }];
    return mod;
  });

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const env = process.env;
  const androidMapsKey = env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() || undefined;

  // Stop an Android build on EAS early instead of producing an app with a blank map.
  if (!androidMapsKey && env.EAS_BUILD_PLATFORM === 'android') {
    throw new Error('GOOGLE_MAPS_ANDROID_API_KEY is not set, so the Android map would be blank. See app.config.ts.');
  }
  // And a store build without a support email, which App Review would reject.
  if (env.EAS_BUILD_PROFILE === 'production' && !env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim()) {
    throw new Error('EXPO_PUBLIC_SUPPORT_EMAIL is not set; App Review needs a way to contact you. See app.config.ts.');
  }
  // And a store build without the server, which would quietly show only the
  // starter spots, with no sign-in, to testers and App Review.
  if (
    env.EAS_BUILD_PROFILE === 'production' &&
    (!env.EXPO_PUBLIC_SUPABASE_URL?.trim() || !env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim())
  ) {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set for the production environment on expo.dev, so this build would have no server or sign-in. See README, "Connect Supabase".',
    );
  }

  const sentryOrg = env.SENTRY_ORG?.trim();
  const sentryProject = env.SENTRY_PROJECT?.trim();
  const sentryPlugin: [string, Record<string, string>][] =
    sentryOrg && sentryProject
      ? [['@sentry/react-native/expo', { url: 'https://sentry.io/', organization: sentryOrg, project: sentryProject }]]
      : [];

  const googleServicesFile =
    env.GOOGLE_SERVICES_JSON?.trim() || (existsSync('./google-services.json') ? './google-services.json' : undefined);

  const extra = config.extra as { eas?: { projectId?: unknown } } | undefined;
  const projectId = typeof extra?.eas?.projectId === 'string' ? extra.eas.projectId : undefined;

  return withOldAndroidCamera({
    ...config,
    name: config.name ?? 'DisCamp',
    slug: config.slug ?? 'discamp',
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
    updates: projectId
      ? { ...config.updates, url: `https://u.expo.dev/${projectId}` }
      : { ...config.updates, enabled: false },
    plugins: [
      ...(config.plugins ?? []),
      ['react-native-maps', { androidGoogleMapsApiKey: androidMapsKey }],
      ...sentryPlugin,
    ],
  });
}
