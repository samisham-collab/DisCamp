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
// SENTRY_ORG and SENTRY_PROJECT (plus the SENTRY_AUTH_TOKEN secret): when
// set, builds upload source maps so crash reports show DisCamp's own code.
// Crash reports themselves only need EXPO_PUBLIC_SENTRY_DSN. See README.
//
// Over-the-air updates: `npx eas-cli@latest init` writes the project id to
// app.json (extra.eas.projectId); updates are on from then on.

import type { ConfigContext, ExpoConfig } from 'expo/config';

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

  const sentryOrg = env.SENTRY_ORG?.trim();
  const sentryProject = env.SENTRY_PROJECT?.trim();
  const sentryPlugin: [string, Record<string, string>][] =
    sentryOrg && sentryProject
      ? [['@sentry/react-native/expo', { url: 'https://sentry.io/', organization: sentryOrg, project: sentryProject }]]
      : [];

  const extra = config.extra as { eas?: { projectId?: unknown } } | undefined;
  const projectId = typeof extra?.eas?.projectId === 'string' ? extra.eas.projectId : undefined;

  return {
    ...config,
    name: config.name ?? 'DisCamp',
    slug: config.slug ?? 'discamp',
    updates: projectId
      ? { ...config.updates, url: `https://u.expo.dev/${projectId}` }
      : { ...config.updates, enabled: false },
    plugins: [
      ...(config.plugins ?? []),
      ['react-native-maps', { androidGoogleMapsApiKey: androidMapsKey }],
      ...sentryPlugin,
    ],
  };
}
