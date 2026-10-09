// Where the sign-in session lives on the phone: the iOS Keychain or Android
// Keystore (expo-secure-store), never plain storage.
//
// A Supabase session is a few kilobytes and Secure Store warns above 2 KB
// per item, so each value is split into chunks. Each save writes a new set
// of chunks (a "generation"), then points `<key>.n` at it, then deletes the
// old set. A read at any moment sees a whole value: the old one until the
// switch, the new one after. Reading never sees a half-written session,
// which would look like being signed out.

import * as SecureStore from 'expo-secure-store';

/** Code points per chunk. At most 4 bytes each, so a chunk stays under 2 KB. */
export const CHUNK_CODE_POINTS = 500;

const OPTIONS: SecureStore.SecureStoreOptions = {
  // Readable after the first unlock, so a background token refresh works,
  // and never copied to another device in a backup.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** Secure Store keys may only use letters, digits, ".", "-" and "_". */
export function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

const pointerKey = (key: string) => `${safeKey(key)}.n`;
const chunkKey = (key: string, generation: string, i: number) => `${safeKey(key)}.${generation}.${i}`;

interface Pointer {
  generation: string;
  count: number;
}

/** "<generation>:<count>", e.g. "m1x2k3a:7". */
async function readPointer(key: string): Promise<Pointer | null> {
  const raw = await SecureStore.getItemAsync(pointerKey(key), OPTIONS);
  const match = raw == null ? null : /^([a-z0-9]{1,20}):(\d{1,3})$/.exec(raw);
  if (!match) return null;
  const count = Number(match[2]);
  return count > 0 ? { generation: match[1] as string, count } : null;
}

let counter = 0;
function newGeneration(previous: string | undefined): string {
  let generation: string;
  do {
    counter = (counter + 1) % 1_000_000;
    generation = `${Date.now().toString(36)}${counter.toString(36)}`;
  } while (generation === previous);
  return generation;
}

async function deleteChunks(key: string, pointer: Pointer): Promise<void> {
  for (let i = 0; i < pointer.count; i += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, pointer.generation, i), OPTIONS);
  }
}

/** Splits text into chunks without cutting a character's code point in half. */
export function splitChunks(value: string, size: number = CHUNK_CODE_POINTS): string[] {
  const points = Array.from(value);
  const chunks: string[] = [];
  for (let i = 0; i < points.length; i += size) chunks.push(points.slice(i, i + size).join(''));
  return chunks.length > 0 ? chunks : [''];
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    // A save can switch generations while this reads; if a chunk vanished,
    // read once more from the new pointer.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const pointer = await readPointer(key);
      if (!pointer) return null;
      const parts = await Promise.all(
        Array.from({ length: pointer.count }, (_, i) =>
          SecureStore.getItemAsync(chunkKey(key, pointer.generation, i), OPTIONS),
        ),
      );
      if (parts.every((p) => p != null)) return parts.join('');
    }
    // Still incomplete: the value is damaged. Treat it as signed out.
    return null;
  },

  async setItem(key: string, value: string): Promise<void> {
    const previous = await readPointer(key);
    const chunks = splitChunks(value);
    const generation = newGeneration(previous?.generation);
    for (let i = 0; i < chunks.length; i += 1) {
      await SecureStore.setItemAsync(chunkKey(key, generation, i), chunks[i] ?? '', OPTIONS);
    }
    await SecureStore.setItemAsync(pointerKey(key), `${generation}:${chunks.length}`, OPTIONS);
    if (previous) await deleteChunks(key, previous);
  },

  async removeItem(key: string): Promise<void> {
    const previous = await readPointer(key);
    await SecureStore.deleteItemAsync(pointerKey(key), OPTIONS);
    if (previous) await deleteChunks(key, previous);
  },
};
