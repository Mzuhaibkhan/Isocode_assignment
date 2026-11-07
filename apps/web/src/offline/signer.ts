import {
  generateDeviceKeyPair,
  exportPublicKeyJwk,
  signHash,
} from "@procurement/shared";
import { db } from "./db.js";

export interface DeviceMeta {
  deviceId: string;
  publicKeyJwk: string;
  registeredAt?: string;
}

/**
 * Retrieves the device key pair from IndexedDB (via structured clone),
 * or generates and stores a new P-256 key pair on first run (§9.1).
 */
export async function getOrCreateDeviceKey(): Promise<{
  keyPair: CryptoKeyPair;
  deviceId: string;
  publicKeyJwk: string;
}> {
  const existingKey = (await db.meta.get("deviceKeyPair"))?.value as CryptoKeyPair | undefined;
  let deviceId = ((await db.meta.get("deviceId"))?.value as string) || "";
  let publicKeyJwk = ((await db.meta.get("publicKeyJwk"))?.value as string) || "";

  if (existingKey && deviceId && publicKeyJwk) {
    return { keyPair: existingKey, deviceId, publicKeyJwk };
  }

  // Generate new ECDSA P-256 Key Pair
  const newKeyPair = await generateDeviceKeyPair();
  const jwk = await exportPublicKeyJwk(newKeyPair.publicKey);
  publicKeyJwk = JSON.stringify(jwk);

  if (!deviceId) {
    deviceId = `dev-${crypto.randomUUID().slice(0, 8)}`;
  }

  await db.meta.put({ key: "deviceKeyPair", value: newKeyPair });
  await db.meta.put({ key: "publicKeyJwk", value: publicKeyJwk });
  await db.meta.put({ key: "deviceId", value: deviceId });

  // Initialize sequence and hash chain if empty
  const nextSeq = await db.meta.get("nextSeq");
  if (!nextSeq) {
    await db.meta.put({ key: "nextSeq", value: 1 });
  }

  const lastHash = await db.meta.get("lastHash");
  if (!lastHash) {
    await db.meta.put({ key: "lastHash", value: "0".repeat(64) });
  }

  return { keyPair: newKeyPair, deviceId, publicKeyJwk };
}

/**
 * Registers the device public key with the backend server (§9.1 step 3).
 */
export async function registerDeviceWithServer(centreId = "centre-c07"): Promise<boolean> {
  try {
    const { deviceId, publicKeyJwk } = await getOrCreateDeviceKey();

    const res = await fetch("/devices/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId,
        centreId,
        publicKeyJwk,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      await db.meta.put({ key: "registeredAt", value: data.registeredAt || new Date().toISOString() });
      return true;
    }
    return false;
  } catch (err) {
    console.warn("Device registration skipped (offline)", err);
    return false;
  }
}

export { signHash };

