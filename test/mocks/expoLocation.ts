// Test stand-in for expo-location. Defaults: permission not asked yet, and
// granting it finds the camper in Goodland, Kansas.

import { jest } from '@jest/globals';

type Permission = { status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean; granted: boolean };
type Position = { coords: { latitude: number; longitude: number } };

export const GOODLAND = { latitude: 39.3508, longitude: -101.7101 };

export const Accuracy = { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 };

export const getForegroundPermissionsAsync = jest.fn<() => Promise<Permission>>(async () => ({
  status: 'undetermined',
  canAskAgain: true,
  granted: false,
}));

export const requestForegroundPermissionsAsync = jest.fn<() => Promise<Permission>>(async () => ({
  status: 'granted',
  canAskAgain: true,
  granted: true,
}));

export const hasServicesEnabledAsync = jest.fn<() => Promise<boolean>>(async () => true);

export const getLastKnownPositionAsync = jest.fn<() => Promise<Position | null>>(async () => null);

export const getCurrentPositionAsync = jest.fn<() => Promise<Position>>(async () => ({ coords: GOODLAND }));
