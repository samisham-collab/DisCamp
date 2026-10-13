// Test stand-in for expo-image-picker: the camera is allowed and returns a
// large photo, unless a test says otherwise.

import { jest } from '@jest/globals';

type Result =
  | { canceled: false; assets: { uri: string; width: number; height: number }[] }
  | {
      canceled: true;
      assets: null;
    };

const photo = (): Result => ({
  canceled: false,
  assets: [{ uri: 'file:///camera/photo.jpg', width: 4032, height: 3024 }],
});

export const requestCameraPermissionsAsync = jest.fn(async () => ({
  granted: true,
  status: 'granted',
  canAskAgain: true,
}));
export const launchCameraAsync = jest.fn(async (_options?: unknown): Promise<Result> => photo());
export const launchImageLibraryAsync = jest.fn(async (_options?: unknown): Promise<Result> => photo());
