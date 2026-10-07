// Build-time settings layered on top of app.json. Only values that come from
// the environment (keys you don't want in git) belong here.
//
// GOOGLE_MAPS_ANDROID_API_KEY: Android store builds draw the map with Google
// Maps, which needs a Google Cloud key with "Maps SDK for Android" on. Without
// it the map is blank on Android. iPhone uses Apple Maps and needs no key, and
// Expo Go needs none either. Add it on expo.dev (your project > Environment
// variables) for every environment you build Android in, or with:
//   eas env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value <key> --environment production --visibility sensitive

import type { ConfigContext, ExpoConfig } from 'expo/config';

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() || undefined;

  // Stop an Android build on EAS early instead of producing an app with a blank map.
  if (!androidMapsKey && process.env.EAS_BUILD_PLATFORM === 'android') {
    throw new Error('GOOGLE_MAPS_ANDROID_API_KEY is not set, so the Android map would be blank. See app.config.ts.');
  }

  return {
    ...config,
    name: config.name ?? 'DisCamp',
    slug: config.slug ?? 'discamp',
    plugins: [...(config.plugins ?? []), ['react-native-maps', { androidGoogleMapsApiKey: androidMapsKey }]],
  };
}
