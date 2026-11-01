import * as Crypto from "expo-crypto";

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Fresh nonce per sign-in attempt. Google receives `hashed`; Supabase receives `raw` and checks
 * that SHA-256(raw) equals the token's nonce claim. Never log either value.
 */
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = toHex(await Crypto.getRandomBytesAsync(32));
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  return { raw, hashed };
}
