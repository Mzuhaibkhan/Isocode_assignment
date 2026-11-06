import { describe, it, expect } from "vitest";
import {
  generateDeviceKeyPair,
  exportPublicKeyJwk,
  signHash,
  verifySignature,
} from "../signer.js";
import { sha256Hex } from "../hashChain.js";

describe("Phase 4: Device Key Generation, Signing & Verification (§9.1, §9.4)", () => {
  it("generates an ECDSA P-256 keypair and exports public key JWK", async () => {
    const keyPair = await generateDeviceKeyPair();
    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.privateKey).toBeDefined();

    const jwk = await exportPublicKeyJwk(keyPair.publicKey);
    expect(jwk.kty).toBe("EC");
    expect(jwk.crv).toBe("P-256");
    expect(jwk.x).toBeDefined();
    expect(jwk.y).toBeDefined();
  });

  it("signs an entry hash and verifies successfully with the public JWK", async () => {
    const keyPair = await generateDeviceKeyPair();
    const jwk = await exportPublicKeyJwk(keyPair.publicKey);

    const hashHex = await sha256Hex("sample-purchase-payload-data");
    const signatureBase64 = await signHash(keyPair.privateKey, hashHex);

    expect(typeof signatureBase64).toBe("string");
    expect(signatureBase64.length).toBeGreaterThan(20);

    const isValid = await verifySignature(jwk, signatureBase64, hashHex);
    expect(isValid).toBe(true);
  });

  it("rejects verification if the hash was tampered with", async () => {
    const keyPair = await generateDeviceKeyPair();
    const jwk = await exportPublicKeyJwk(keyPair.publicKey);

    const originalHash = await sha256Hex("original-purchase-data");
    const tamperedHash = await sha256Hex("tampered-purchase-data");

    const signature = await signHash(keyPair.privateKey, originalHash);

    const isValid = await verifySignature(jwk, signature, tamperedHash);
    expect(isValid).toBe(false);
  });

  it("rejects verification with a different device's public key", async () => {
    const device1 = await generateDeviceKeyPair();
    const device2 = await generateDeviceKeyPair();
    const jwk2 = await exportPublicKeyJwk(device2.publicKey);

    const hashHex = await sha256Hex("some-data");
    const signatureFromDevice1 = await signHash(device1.privateKey, hashHex);

    // Verify signature of device 1 with device 2's key
    const isValid = await verifySignature(jwk2, signatureFromDevice1, hashHex);
    expect(isValid).toBe(false);
  });
});

