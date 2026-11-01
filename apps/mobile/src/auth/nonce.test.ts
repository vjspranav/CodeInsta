import { createHash } from "crypto";

jest.mock("expo-crypto", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require("crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    CryptoEncoding: { HEX: "hex" },
    getRandomBytesAsync: async (n: number) => new Uint8Array(nodeCrypto.randomBytes(n)),
    digestStringAsync: async (_a: string, data: string, o: { encoding: string }) =>
      nodeCrypto.createHash("sha256").update(data).digest(o.encoding),
  };
});

import { makeNonce } from "./nonce";

describe("makeNonce", () => {
  it("returns 64 hex chars and its SHA-256 hex", async () => {
    const { raw, hashed } = await makeNonce();
    expect(raw).toMatch(/^[a-f0-9]{64}$/);
    expect(hashed).toBe(createHash("sha256").update(raw).digest("hex"));
  });

  it("differs between calls", async () => {
    const a = await makeNonce();
    const b = await makeNonce();
    expect(a.raw).not.toBe(b.raw);
  });
});
