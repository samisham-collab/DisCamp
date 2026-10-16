// Expo Go (the app for trying DisCamp during development) can't do what
// needs the App Store or Google Play: notifications and tips. Its own file,
// so tests can pretend to be a store build.

import { isRunningInExpoGo } from 'expo';

export function inExpoGo(): boolean {
  return isRunningInExpoGo();
}
