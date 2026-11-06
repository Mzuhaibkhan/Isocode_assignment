import { describe, it, expect, beforeAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { runSeed } from "../db/seed.js";
import {
  generateDeviceKeyPair,
  exportPublicKeyJwk,
  signHash,
  canonicalJson,
  sha256Hex,
  entryHash,
  SyncRejectionReason,
  SyncHoldReason,
} from "@procurement/shared";
import { decryptBank } from "../crypto/aes.js";
import { eq, and, desc } from "drizzle-orm";
import crypto from "node:crypto";

describe("Phase 4: Offline-First Tamper-Proof Sync Pipeline (§9.7, §9.8)", () => {
  let app: FastifyInstance;
  let deviceKeyPair: CryptoKeyPair;
  let deviceJwk: JsonWebKey;
  const testDeviceId = "dev-test-p4-01";
  const centreId = "centre-c07";

  const operatorSession = JSON.stringify({
    id: "user-op-c07",
    role: "operator",
    name: "Ramesh Patil",
    centreId: "centre-c07",
  });

  const officeSession = JSON.stringify({
    id: "user-office-1",
    role: "office_manager",
    name: "Anil Kadam",
  });

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
    await runSeed(db);

    // 1. Generate P-256 keypair and register test device (§9.1)
    deviceKeyPair = await generateDeviceKeyPair();
    deviceJwk = await exportPublicKeyJwk(deviceKeyPair.publicKey);

    const regRes = await app.inject({
      method: "POST",
      url: "/devices/register",
      cookies: { session: operatorSession },
      payload: {
        deviceId: testDeviceId,
        centreId,
        publicKeyJwk: JSON.stringify(deviceJwk),
      },
    });

    expect(regRes.statusCode).toBe(200);
  });

  // Helper to build, hash, and sign a purchase entry
  async function createSignedEntry(overrides: Partial<{
    id: string;
    slipNo: string;
    memberId: string;
    crop: string;
    grade: string;
    grossX10: number;
    tareX10: number;
    moistureX10: number;
    netX10: number;
    ratePaise: number;
    amountPaise: number;
    priceVersion: number;
    clientTime: string;
    deviceId: string;
    deviceSeq: number;
    prevHash: string;
    tamperPayloadHash?: boolean;
    tamperSignature?: boolean;
  }> = {}) {
    const entryId = overrides.id || crypto.randomUUID();
    const slipNo = overrides.slipNo || `C07-${Math.floor(10000 + Math.random() * 90000)}`;
    const prevHash = overrides.prevHash || "0".repeat(64);
    const deviceSeq = overrides.deviceSeq ?? 1;

    const payload = {
      id: entryId,
      slipNo,
      memberId: overrides.memberId || "member-1",
      crop: overrides.crop || "Soybean",
      grade: overrides.grade || "FAQ",
      grossX10: overrides.grossX10 ?? 12500, // 1250.0 kg
      tareX10: overrides.tareX10 ?? 180,    // 18.0 kg
      moistureX10: overrides.moistureX10 ?? 115, // 11.5 %
      netX10: overrides.netX10 ?? 12320,    // 1232.0 kg
      ratePaise: overrides.ratePaise ?? 485000,
      amountPaise: overrides.amountPaise ?? 5975200,
      priceVersion: overrides.priceVersion ?? 1,
      clientTime: overrides.clientTime || new Date().toISOString(),
      deviceId: overrides.deviceId || testDeviceId,
      deviceSeq,
      correctsId: null,
    };

    let computedHash = await entryHash(payload, prevHash);
    if (overrides.tamperPayloadHash) {
      computedHash = await sha256Hex("tampered-hash-value");
    }

    let signature = await signHash(deviceKeyPair.privateKey, computedHash);
    if (overrides.tamperSignature) {
      signature = "invalid-base64-signature-==";
    }

    return {
      ...payload,
      prevHash,
      entryHash: computedHash,
      signature,
    };
  }

  it("syncs a valid ordered batch of signed purchases and logs SMS (§9.7)", async () => {
    const entry1 = await createSignedEntry({ deviceSeq: 1, prevHash: "0".repeat(64) });
    const entry2 = await createSignedEntry({
      deviceSeq: 2,
      prevHash: entry1.entryHash,
      memberId: "member-2",
      grossX10: 8600,
      tareX10: 120,
      moistureX10: 140,
      netX10: 8310,
      amountPaise: 4030350,
    });

    const res = await app.inject({
      method: "POST",
      url: "/sync/purchases",
      payload: {
        deviceId: testDeviceId,
        entries: [entry1, entry2],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.syncedCount).toBe(2);
    expect(body.rejectedCount).toBe(0);
    expect(body.results[0].status).toBe("accepted");
    expect(body.results[1].status).toBe("accepted");

    // Verify purchases exist in DB with server_received_at
    const [p1] = await db.select().from(schema.purchases).where(eq(schema.purchases.id, entry1.id));
    expect(p1).toBeDefined();
    expect(p1.entryHash).toBe(entry1.entryHash);
    expect(p1.status).toBe("accepted");

    // Verify SMS logs exist for both
    const smsRows = await db.select().from(schema.smsLog).where(eq(schema.smsLog.purchaseId, entry1.id));
    expect(smsRows.length).toBeGreaterThan(0);
  });

  it("handles duplicate upload of the same entry idempotently (§9.8 case 1)", async () => {
    // Query last synced entry for sequence 2
    const [p2] = await db
      .select()
      .from(schema.purchases)
      .where(and(eq(schema.purchases.deviceId, testDeviceId), eq(schema.purchases.deviceSeq, 2)));

    expect(p2).toBeDefined();

    // Re-submit sequence 2 with exact same hash
    const duplicateEntry = {
      id: p2.id,
      slipNo: p2.slipNo,
      memberId: p2.memberId,
      crop: p2.crop,
      grade: p2.grade,
      grossX10: p2.grossX10,
      tareX10: p2.tareX10,
      moistureX10: p2.moistureX10,
      netX10: p2.netX10,
      ratePaise: p2.ratePaise,
      amountPaise: p2.amountPaise,
      priceVersion: p2.priceVersion,
      clientTime: p2.clientTime.toISOString(),
      deviceId: testDeviceId,
      deviceSeq: 2,
      prevHash: p2.prevHash,
      entryHash: p2.entryHash,
      signature: p2.signature,
      correctsId: null,
    };

    const res = await app.inject({
      method: "POST",
      url: "/sync/purchases",
      payload: {
        deviceId: testDeviceId,
        entries: [duplicateEntry],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.duplicateCount).toBe(1);
    expect(body.results[0].status).toBe("duplicate");
  });

  it("rejects an out-of-order entry with SEQ_GAP reason (§9.8 case 3)", async () => {
    // Current highest seq is 2. Uploading seq 5 directly
    const [last] = await db
      .select({ entryHash: schema.purchases.entryHash })
      .from(schema.purchases)
      .where(eq(schema.purchases.deviceId, testDeviceId))
      .orderBy(desc(schema.purchases.deviceSeq))
      .limit(1);

    const gappedEntry = await createSignedEntry({
      deviceSeq: 5, // Gap! Expected 3
      prevHash: last.entryHash,
    });

    const res = await app.inject({
      method: "POST",
      url: "/sync/purchases",
      payload: {
        deviceId: testDeviceId,
        entries: [gappedEntry],
      },
    });

    const body = JSON.parse(res.payload);
    expect(body.results[0].status).toBe("rejected");
    expect(body.results[0].reason).toBe(SyncRejectionReason.SEQ_GAP);
  });

  it("rejects tampered payload hash with HASH_MISMATCH reason (§9.8 case 6)", async () => {
    const [last] = await db
      .select({ entryHash: schema.purchases.entryHash })
      .from(schema.purchases)
      .where(eq(schema.purchases.deviceId, testDeviceId))
      .orderBy(desc(schema.purchases.deviceSeq))
      .limit(1);

    const tamperedEntry = await createSignedEntry({
      deviceSeq: 3,
      prevHash: last.entryHash,
      tamperPayloadHash: true, // Artificial hash mismatch
    });

    const res = await app.inject({
      method: "POST",
      url: "/sync/purchases",
      payload: {
        deviceId: testDeviceId,
        entries: [tamperedEntry],
      },
    });

    const body = JSON.parse(res.payload);
    expect(body.results[0].status).toBe("rejected");
    expect(body.results[0].reason).toBe(SyncRejectionReason.HASH_MISMATCH);
  });

  it("rejects invalid signature with SIGNATURE_INVALID reason (§9.8 case 6)", async () => {
    const [last] = await db
      .select({ entryHash: schema.purchases.entryHash })
      .from(schema.purchases)
      .where(eq(schema.purchases.deviceId, testDeviceId))
      .orderBy(desc(schema.purchases.deviceSeq))
      .limit(1);

    const invalidSigEntry = await createSignedEntry({
      deviceSeq: 3,
      prevHash: last.entryHash,
      tamperSignature: true,
    });

    const res = await app.inject({
      method: "POST",
      url: "/sync/purchases",
      payload: {
        deviceId: testDeviceId,
        entries: [invalidSigEntry],
      },
    });

    const body = JSON.parse(res.payload);
    expect(body.results[0].status).toBe("rejected");
    expect(body.results[0].reason).toBe(SyncRejectionReason.SIGNATURE_INVALID);
  });

  it("rejects altered rate for claimed version with RATE_MISMATCH (§9.8 case 7)", async () => {
    const [last] = await db
      .select({ entryHash: schema.purchases.entryHash })
      .from(schema.purchases)
      .where(eq(schema.purchases.deviceId, testDeviceId))
      .orderBy(desc(schema.purchases.deviceSeq))
      .limit(1);

    const alteredRateEntry = await createSignedEntry({
      deviceSeq: 3,
      prevHash: last.entryHash,
      priceVersion: 1, // Soybean v1 rate is 485000
      ratePaise: 500000, // Altered rate!
      amountPaise: 6160000,
    });

    const res = await app.inject({
      method: "POST",
      url: "/sync/purchases",
      payload: {
        deviceId: testDeviceId,
        entries: [alteredRateEntry],
      },
    });

    const body = JSON.parse(res.payload);
    expect(body.results[0].status).toBe("rejected");
    expect(body.results[0].reason).toBe(SyncRejectionReason.RATE_MISMATCH);
  });

  it("accepts but holds entry with STALE_PRICE_VERSION if price changed while offline (§9.8 case 8)", async () => {
    // 1. Office publishes price version 2 for Soybean with effectiveFrom in the past
    const effectivePast = new Date(Date.now() - 3600 * 1000); // 1 hour ago
    await app.inject({
      method: "POST",
      url: "/prices",
      cookies: { session: officeSession },
      payload: {
        crop: "Soybean",
        grade: "FAQ",
        ratePaisePerQuintal: 510000,
        effectiveFrom: effectivePast.toISOString(),
      },
    });

    const [last] = await db
      .select({ entryHash: schema.purchases.entryHash })
      .from(schema.purchases)
      .where(eq(schema.purchases.deviceId, testDeviceId))
      .orderBy(desc(schema.purchases.deviceSeq))
      .limit(1);

    // Operator phone was offline, still using v1 rate (485000) at clientTime = now
    const staleEntry = await createSignedEntry({
      deviceSeq: 3,
      prevHash: last.entryHash,
      priceVersion: 1,
      ratePaise: 485000,
      clientTime: new Date().toISOString(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/sync/purchases",
      payload: {
        deviceId: testDeviceId,
        entries: [staleEntry],
      },
    });

    const body = JSON.parse(res.payload);
    expect(body.results[0].status).toBe("held");
    expect(body.results[0].flagCodes).toContain(SyncHoldReason.STALE_PRICE_VERSION);
  });

  it("accepts but holds entry with CLOCK_SKEW if client clock is skewed >6 hours (§9.8 case 4)", async () => {
    const [last] = await db
      .select({ entryHash: schema.purchases.entryHash })
      .from(schema.purchases)
      .where(eq(schema.purchases.deviceId, testDeviceId))
      .orderBy(desc(schema.purchases.deviceSeq))
      .limit(1);

    // 24 hours in the past
    const skewedTime = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const skewedEntry = await createSignedEntry({
      deviceSeq: 4,
      prevHash: last.entryHash,
      priceVersion: 2, // Use current active version
      ratePaise: 510000,
      netX10: 12320,
      amountPaise: 6283200,
      clientTime: skewedTime,
    });

    const res = await app.inject({
      method: "POST",
      url: "/sync/purchases",
      payload: {
        deviceId: testDeviceId,
        entries: [skewedEntry],
      },
    });

    const body = JSON.parse(res.payload);
    expect(body.results[0].status).toBe("held");
    expect(body.results[0].flagCodes).toContain(SyncHoldReason.CLOCK_SKEW);
  });

  it("accepts but holds entry with CONSENT_WITHDRAWN if member withdrew consent (§9.8 case 10)", async () => {
    // Withdraw consent for member-5
    await app.inject({
      method: "POST",
      url: "/members/member-5/withdraw-consent",
      cookies: { session: officeSession },
    });

    const [last] = await db
      .select({ entryHash: schema.purchases.entryHash })
      .from(schema.purchases)
      .where(eq(schema.purchases.deviceId, testDeviceId))
      .orderBy(desc(schema.purchases.deviceSeq))
      .limit(1);

    const consentWithdrawnEntry = await createSignedEntry({
      memberId: "member-5",
      deviceSeq: 5,
      prevHash: last.entryHash,
      priceVersion: 2,
      ratePaise: 510000,
      netX10: 12320,
      amountPaise: 6283200,
      clientTime: new Date().toISOString(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/sync/purchases",
      payload: {
        deviceId: testDeviceId,
        entries: [consentWithdrawnEntry],
      },
    });

    const body = JSON.parse(res.payload);
    expect(body.results[0].status).toBe("held");
    expect(body.results[0].flagCodes).toContain(SyncHoldReason.CONSENT_WITHDRAWN);
  });

  it("rejects sync when device is revoked with DEVICE_REVOKED (§9.8 case 5)", async () => {
    // Revoke testDeviceId
    const revokeRes = await app.inject({
      method: "POST",
      url: `/devices/${testDeviceId}/revoke`,
      cookies: { session: officeSession },
      payload: { reason: "Lost device in transit" },
    });
    expect(revokeRes.statusCode).toBe(200);

    const [last] = await db
      .select({ entryHash: schema.purchases.entryHash })
      .from(schema.purchases)
      .where(eq(schema.purchases.deviceId, testDeviceId))
      .orderBy(desc(schema.purchases.deviceSeq))
      .limit(1);

    const entryFromRevoked = await createSignedEntry({
      deviceSeq: 6,
      prevHash: last.entryHash,
      priceVersion: 2,
      ratePaise: 510000,
      netX10: 12320,
      amountPaise: 6283200,
    });

    const res = await app.inject({
      method: "POST",
      url: "/sync/purchases",
      payload: {
        deviceId: testDeviceId,
        entries: [entryFromRevoked],
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("DEVICE_REVOKED");
    expect(body.results[0].reason).toBe(SyncRejectionReason.DEVICE_REVOKED);
  });

  it("preserves member bank snapshot even if live member row changes later (§9.8 case 9)", async () => {
    // Verify an existing accepted purchase's member snapshot
    const [p1] = await db
      .select()
      .from(schema.purchases)
      .where(and(eq(schema.purchases.deviceId, testDeviceId), eq(schema.purchases.deviceSeq, 1)));

    expect(p1).toBeDefined();
    const originalSnapshot = JSON.parse(decryptBank(p1.memberSnapshotJson));

    // Live member edits bank account
    await app.inject({
      method: "PATCH",
      url: `/members/${p1.memberId}`,
      cookies: { session: officeSession },
      payload: {
        bankAccount: "99887766554433",
        ifsc: "SBIN0009999",
      },
    });

    // Re-read p1 from db
    const [p1After] = await db
      .select()
      .from(schema.purchases)
      .where(eq(schema.purchases.id, p1.id));

    const preservedSnapshot = JSON.parse(decryptBank(p1After.memberSnapshotJson));
    expect(preservedSnapshot.bankAccountMasked).toBe(originalSnapshot.bankAccountMasked);
    expect(preservedSnapshot.ifsc).toBe(originalSnapshot.ifsc);
    expect(preservedSnapshot.ifsc).not.toBe("SBIN0009999");
  });
});
