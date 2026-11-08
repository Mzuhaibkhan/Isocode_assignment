const ECDSA_PARAMS = { name: "ECDSA", hash: "SHA-256" } as const;
const ECDSA_KEY_GEN = { name: "ECDSA", namedCurve: "P-256" } as const;

/**
 * Generates an ECDSA P-256 key pair for device identity and tamper-proof signing (§9.1, §9.4).
 * The key pair is non-extractable: the private key can never leave the device,
 * and the CryptoKeyPair object is persisted as-is in IndexedDB (structured clone).
 */
export async function generateDeviceKeyPair(): Promise<CryptoKeyPair> {
  return globalThis.crypto.subtle.generateKey(
    ECDSA_KEY_GEN,
    false, // Non-extractable: the private key stays inside the secure context
    ["sign", "verify"]
  );
}

/**
 * Exports a public CryptoKey as a JSON Web Key (JWK) for registration with the server.
 */
export async function exportPublicKeyJwk(publicKey: CryptoKey): Promise<JsonWebKey> {
  return globalThis.crypto.subtle.exportKey("jwk", publicKey);
}

/**
 * Signs an entry hash (hex string) using the device's ECDSA P-256 private key (§9.4).
 * Returns raw IEEE P1363 signature encoded as base64 string.
 */
export async function signHash(privateKey: CryptoKey, hashHex: string): Promise<string> {
  const hashBytes = new TextEncoder().encode(hashHex);
  const signature = await globalThis.crypto.subtle.sign(
    ECDSA_PARAMS,
    privateKey,
    hashBytes
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Verifies an ECDSA P-256 signature against the device's registered public key JWK (§9.7).
 */
export async function verifySignature(
  publicKeyJwk: JsonWebKey | string,
  signatureBase64: string,
  hashHex: string
): Promise<boolean> {
  try {
    const jwk = typeof publicKeyJwk === "string" ? JSON.parse(publicKeyJwk) : publicKeyJwk;
    const publicKey = await globalThis.crypto.subtle.importKey(
      "jwk",
      jwk,
      ECDSA_KEY_GEN,
      false,
      ["verify"]
    );

    const sigBytes = Uint8Array.from(atob(signatureBase64), (c) => c.charCodeAt(0));
    const hashBytes = new TextEncoder().encode(hashHex);

    return await globalThis.crypto.subtle.verify(
      ECDSA_PARAMS,
      publicKey,
      sigBytes,
      hashBytes
    );
  } catch (err) {
    return false;
  }
}

