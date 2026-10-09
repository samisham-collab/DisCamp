import { describe, expect, it, jest } from '@jest/globals';
import * as SecureStore from 'expo-secure-store';

import { CHUNK_CODE_POINTS, safeKey, secureSessionStorage, splitChunks } from '@/lib/secureStorage';

const { store } = jest.requireMock<{ store: Map<string, string> }>('expo-secure-store');

const chunkKeys = (key: string) => [...store.keys()].filter((k) => k.startsWith(`${key}.`) && k !== `${key}.n`);

describe('secure session storage', () => {
  it('round-trips a long session in chunks under 2 KB each', async () => {
    const session = JSON.stringify({ access_token: 'x'.repeat(1800), user: { name: 'José 🏕️'.repeat(200) } });
    await secureSessionStorage.setItem('sb-abc-auth-token', session);
    expect(await secureSessionStorage.getItem('sb-abc-auth-token')).toBe(session);

    const chunks = chunkKeys('sb-abc-auth-token');
    expect(store.get('sb-abc-auth-token.n')).toMatch(new RegExp(`^[a-z0-9]+:${chunks.length}$`));
    expect(chunks.length).toBeGreaterThan(1);
    for (const key of chunks) expect(Buffer.byteLength(store.get(key) ?? '', 'utf8')).toBeLessThan(2048);
  });

  it('never splits a character between chunks', () => {
    const text = '🏕️'.repeat(CHUNK_CODE_POINTS);
    const chunks = splitChunks(text, 3);
    expect(chunks.join('')).toBe(text);
    for (const chunk of chunks) expect(chunk.isWellFormed()).toBe(true);
    expect(splitChunks('')).toEqual(['']);
  });

  it('replaces a value and cleans up the old chunks', async () => {
    await secureSessionStorage.setItem('key', 'a'.repeat(CHUNK_CODE_POINTS * 3));
    await secureSessionStorage.setItem('key', 'short');
    expect(await secureSessionStorage.getItem('key')).toBe('short');
    expect(chunkKeys('key')).toHaveLength(1);
    expect(store.size).toBe(2);
  });

  it('never reads a half-saved value, even mid-save', async () => {
    await secureSessionStorage.setItem('key', 'old '.repeat(CHUNK_CODE_POINTS));
    const reads: (string | null)[] = [];
    // Read after every keychain write of the next save.
    const write = jest.mocked(SecureStore.setItemAsync);
    const real = write.getMockImplementation()!;
    write.mockImplementation(async (k, v, o) => {
      await real(k, v, o);
      reads.push(await secureSessionStorage.getItem('key'));
    });
    await secureSessionStorage.setItem('key', 'new '.repeat(CHUNK_CODE_POINTS));
    write.mockImplementation(real);
    expect(reads.length).toBeGreaterThan(2);
    for (const value of reads)
      expect([`${'old '.repeat(CHUNK_CODE_POINTS)}`, `${'new '.repeat(CHUNK_CODE_POINTS)}`]).toContain(value);
    expect(reads.at(-1)).toBe('new '.repeat(CHUNK_CODE_POINTS));
  });

  it('reads again if a save switches the value mid-read', async () => {
    await secureSessionStorage.setItem('key', 'first');
    const read = jest.mocked(SecureStore.getItemAsync);
    const real = read.getMockImplementation()!;
    let switched = false;
    read.mockImplementation(async (k, o) => {
      // Right after the pointer is read, another save replaces the value.
      if (!switched && k === 'key.n') {
        const pointer = await real(k, o);
        switched = true;
        await secureSessionStorage.setItem('key', 'second');
        return pointer;
      }
      return real(k, o);
    });
    expect(await secureSessionStorage.getItem('key')).toBe('second');
    read.mockImplementation(real);
  });

  it('removes every chunk', async () => {
    await secureSessionStorage.setItem('key', 'a'.repeat(CHUNK_CODE_POINTS * 2));
    await secureSessionStorage.removeItem('key');
    expect(store.size).toBe(0);
    expect(await secureSessionStorage.getItem('key')).toBeNull();
    await secureSessionStorage.removeItem('never-saved');
  });

  it('treats a damaged value as nothing saved', async () => {
    await secureSessionStorage.setItem('key', 'a'.repeat(CHUNK_CODE_POINTS * 2));
    store.delete(chunkKeys('key')[1]!);
    expect(await secureSessionStorage.getItem('key')).toBeNull();
    store.set('key.n', 'not a pointer');
    expect(await secureSessionStorage.getItem('key')).toBeNull();
    store.set('key.n', 'abc:0');
    expect(await secureSessionStorage.getItem('key')).toBeNull();
  });

  it('keeps sessions on this device only, readable after the first unlock', async () => {
    await secureSessionStorage.setItem('key', 'value');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.stringMatching(/^key\.[a-z0-9]+\.0$/), 'value', {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  });

  it('makes any key safe for the keychain', async () => {
    expect(safeKey('sb-abc-auth-token-code-verifier')).toBe('sb-abc-auth-token-code-verifier');
    expect(safeKey('a b/c:d')).toBe('a_b_c_d');
    await secureSessionStorage.setItem('a b', 'v');
    expect(await secureSessionStorage.getItem('a b')).toBe('v');
  });
});
