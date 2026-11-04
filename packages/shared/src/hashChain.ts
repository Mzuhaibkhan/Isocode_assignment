import { canonicalJson } from "./canonicalJson.js";

export async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function entryHash(
  payload: unknown,
  prevHash: string
): Promise<string> {
  return sha256Hex(prevHash + canonicalJson(payload));
}

