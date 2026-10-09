// Test stand-in for expo-apple-authentication: the built-in Apple sheet is
// available (like on an iPhone) and signs in with a token, sharing a name.

import { jest } from '@jest/globals';
import { Pressable, Text } from 'react-native';

export enum AppleAuthenticationScope {
  FULL_NAME = 0,
  EMAIL = 1,
}
export enum AppleAuthenticationButtonType {
  SIGN_IN = 0,
  CONTINUE = 1,
}
export enum AppleAuthenticationButtonStyle {
  WHITE = 0,
  WHITE_OUTLINE = 1,
  BLACK = 2,
}

export const isAvailableAsync = jest.fn(async () => true);

export const signInAsync = jest.fn(async (_options?: { nonce?: string }) => ({
  user: 'apple-user',
  identityToken: 'apple-identity-token',
  fullName: { givenName: 'Sam', familyName: 'Isham' } as { givenName: string | null; familyName: string | null } | null,
  email: 'sam@privaterelay.appleid.com',
}));

export function AppleAuthenticationButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID="apple-sign-in">
      <Text>Continue with Apple</Text>
    </Pressable>
  );
}
