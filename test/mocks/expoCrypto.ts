// Test stand-in for expo-crypto: predictable nonces and a fake hash.

import { jest } from '@jest/globals';

export enum CryptoDigestAlgorithm {
  SHA256 = 'SHA-256',
}

let count = 0;
/** Sequential UUIDs: 00000000-0000-4000-8000-000000000001, …002, … */
export const randomUUID = jest.fn(() => `00000000-0000-4000-8000-${String((count += 1)).padStart(12, '0')}`);
export const digestStringAsync = jest.fn(async (_algorithm: string, data: string) => `sha256(${data})`);
