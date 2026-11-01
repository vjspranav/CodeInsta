import * as SecureStore from "expo-secure-store";

/**
 * Supabase auth storage on top of expo-secure-store. SecureStore rejects values over roughly
 * 2 KB, and a Supabase session is larger, so values are split into pieces of at most
 * CHUNK_BYTES (UTF-8) stored under `<key>.0 .. <key>.<n-1>`, with the count in `<key>.n`.
 * Chunks never split a code point. Nothing here is ever logged.
 */
const CHUNK_BYTES = 1800;

const countKey = (key: string) => `${key}.n`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

export function splitChunks(value: string, limit = CHUNK_BYTES): string[] {
  const chunks: string[] = [];
  let current = "";
  let size = 0;
  for (const char of value) {
    const length = utf8Length(char.codePointAt(0)!);
    if (size + length > limit) {
      chunks.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += length;
  }
  if (current || chunks.length === 0) chunks.push(current);
  return chunks;
}

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key));
  if (raw === null) return 0;
  const count = Number.parseInt(raw, 10);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

async function clear(key: string): Promise<void> {
  const count = await readCount(key);
  await Promise.all(
    Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, i))),
  );
  await SecureStore.deleteItemAsync(countKey(key));
}

export const secureStorage: {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
  removeItem(k: string): Promise<void>;
} = {
  async getItem(key) {
    const count = await readCount(key);
    if (count === 0) return null;
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i))),
    );
    // A missing piece means a torn write: treat as no session rather than returning garbage.
    if (parts.some((part) => part === null)) return null;
    return parts.join("");
  },
  async setItem(key, value) {
    const previous = await readCount(key);
    const chunks = splitChunks(value);
    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(key, i), chunk)));
    await SecureStore.setItemAsync(countKey(key), String(chunks.length));
    // Drop leftovers from a longer previous value.
    await Promise.all(
      Array.from({ length: Math.max(0, previous - chunks.length) }, (_, i) =>
        SecureStore.deleteItemAsync(chunkKey(key, chunks.length + i)),
      ),
    );
  },
  async removeItem(key) {
    await clear(key);
  },
};
