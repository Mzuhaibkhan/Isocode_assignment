import { describe, it, expect, beforeAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { runSeed } from "../db/seed.js";
import {
  netWeightX10,
  amountPaise,
  formatRupees,
  generateDeviceKeyPair,
  exportPublicKeyJwk,
  signHash,
  entryHash,
  SyncHoldReason,
  SyncRejectionReason,
} from "@procurement/shared";
import { decryptBank } from "../crypto/aes.js";
import { eq, desc } from "drizzle-orm";
import crypto from "node:crypto";

describe("Phase 6: Hardening, Polish, Centre Daily Summary & Full Acceptance Suite (§1, §13.3, §16, §19)", () => {
  let app: FastifyInstance;
  let deviceKeyPair: CryptoKeyPair;
  let deviceJwk: JsonWebKey;
  const testDeviceId = "dev-p6-01";
  const centreId = "centre-c07";

  const officeSession = JSON.stringify({
    id: "user-office-1",
    role: "office_manager",
    name: "Anil Kadam",
  });

  const operatorSession = JSON.stringify({
    id: "user-op-c07",
    role: "operator",
    name: "Ramesh Patil",
    centreId: "centre-c07",
  });

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
    await runSeed(db);

    // Register test device
    deviceKeyPair = await generateDeviceKeyPair();
    deviceJwk = await exportPublicKeyJwk(deviceKeyPair.publicKey);

    await app.inject({
      method: "POST",
      url: "/devices/register",
      cookies: { session: operatorSession },
      payload: {
        deviceId: testDeviceId,
        centreId,
        publicKeyJwk: JSON.stringify(deviceJwk),
      },
    });
  });

  // Helper for signed purchases
  async function createSignedPurchase(overrides: {
    seq?: number;
    prevHash?: string;
    grossX10?: number;
    tareX10?: number;
    moistureX10?: number;
    ratePaise?: number;
    crop?: string;
    memberId?: string;
  } = {}) {
    const grossX10 = overrides.grossX10 ?? 12500;
    const tareX10 = overrides.tareX10 ?? 180;
    const moistureX10 = overrides.moistureX10 ?? 115;
    const ratePaise = overrides.ratePaise ?? 485000;
    const netX10 = netWeightX10(grossX10, tareX10, moistureX10);
    const amount = amountPaise(netX10, ratePaise);

    const [last] = await db
      .select({ entryHash: schema.purchases.entryHash, deviceSeq: schema.purchases.deviceSeq })
      .from(schema.purchases)
      .where(eq(schema.purchases.deviceId, testDeviceId))
      .orderBy(desc(schema.purchases.deviceSeq))
      .limit(1);

    const deviceSeq = overrides.seq ?? (last ? last.deviceSeq + 1 : 1);
    const prevHash = overrides.prevHash ?? (last ? last.entryHash : "0".repeat(64));

    const payload = {
      id: crypto.randomUUID(),
      slipNo: `P6-${Math.floor(10000 + Math.random() * 90000)}`,
      memberId: overrides.memberId || "member-1",
      crop: overrides.crop ?? "Soybean",
      grade: "FAQ",
      grossX10,
      tareX10,
      moistureX10,
      netX10,
      ratePaise,
      amountPaise: amount,
      priceVersion: 1,
      clientTime: new Date().toISOString(),
      deviceId: testDeviceId,
      deviceSeq,
      correctsId: null,
    };

    const hash = await entryHash(payload, prevHash);
    const signature = await signHash(deviceKeyPair.privateKey, hash);

    return {
      ...payload,
      prevHash,
      entryHash: hash,
      signature,
    };
  }

  describe("1. Centre Daily Summary API (§1, §8, §13.3)", () => {
    it("returns real-time stock positions aggregated across all procurement centres", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/centres/summary",
        cookies: { session: officeSession },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();

      expect(data).toHaveProperty("asOf");
      expect(data).toHaveProperty("overall");
      expect(data).toHaveProperty("centres");

      // Verify overall aggregation
      expect(data.overall.totalCentres).toBeGreaterThanOrEqual(2);
      expect(typeof data.overall.totalNetKg).toBe("number");
      expect(typeof data.overall.totalAmountFormatted).toBe("string");
      expect(data.overall.totalAmountFormatted).toMatch(/^₹/);

      // Verify centre specifics
      const c07 = data.centres.find((c: any) => c.code === "C07");
      expect(c07).toBeDefined();
      expect(c07.code).toBe("C07");
      expect(c07.village).toBe("Ausa");
      expect(c07.activeDevicesCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(c07.cropBreakdown)).toBe(true);

      const c12 = data.centres.find((c: any) => c.code === "C12");
      expect(c12).toBeDefined();
      expect(c12.code).toBe("C12");
    });

    it("updates centre stock summary dynamically when new purchases sync", async () => {
      // 1. Get initial total for C07
      const initialRes = await app.inject({
        method: "GET",
        url: "/centres/summary",
        cookies: { session: officeSession },
      });
      const initialC07 = initialRes.json().centres.find((c: any) => c.code === "C07");
      const initialPurchases = initialC07.totalPurchases;
      const initialNetKg = initialC07.totalNetKg;

      // 2. Sync a new purchase for C07
      const entry = await createSignedPurchase({
        seq: 1,
        prevHash: "0".repeat(64),
        grossX10: 10000,
        tareX10: 150,
        moistureX10: 120, // 0 deduction -> net 985.0 kg
        crop: "Soybean",
      });

      const syncRes = await app.inject({
        method: "POST",
        url: "/sync/purchases",
        cookies: { session: operatorSession },
        payload: {
          deviceId: testDeviceId,
          entries: [entry],
        },
      });
      expect(syncRes.statusCode).toBe(200);
      expect(syncRes.json().results[0].status).toBe("accepted");

      // 3. Re-query centre summary and assert updated stock
      const updatedRes = await app.inject({
        method: "GET",
        url: "/centres/summary",
        cookies: { session: officeSession },
      });
      const updatedC07 = updatedRes.json().centres.find((c: any) => c.code === "C07");

      expect(updatedC07.totalPurchases).toBe(initialPurchases + 1);
      expect(updatedC07.totalNetKg).toBeCloseTo(initialNetKg + 985.0, 1);
      expect(updatedC07.lastSyncTime).toBeDefined();
    });

    it("rejects unauthorized access when session is missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/centres/summary",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("2. Acceptance Checklist Hardening (§19)", () => {
    it("satisfies the three official sample slips to the exact paisa", () => {
      // Slip 1: C07-24518 (Sunil Jadhav, Soybean)
      const net1 = netWeightX10(12500, 180, 115);
      const amt1 = amountPaise(net1, 485000);
      expect(net1).toBe(12320); // 1232.0 kg
      expect(amt1).toBe(5975200); // ₹59,752.00
      expect(formatRupees(amt1)).toBe("₹59,752.00");

      // Slip 2: C07-24519 (Kamal Shinde, Soybean)
      const net2 = netWeightX10(8600, 120, 140);
      const amt2 = amountPaise(net2, 485000);
      expect(net2).toBe(8310); // 831.0 kg
      expect(amt2).toBe(4030350); // ₹40,303.50
      expect(formatRupees(amt2)).toBe("₹40,303.50");

      // Slip 3: C12-08876 (Mohan Biradar, Tur)
      const net3 = netWeightX10(6400, 100, 100);
      const amt3 = amountPaise(net3, 720000);
      expect(net3).toBe(6300); // 630.0 kg
      expect(amt3).toBe(4536000); // ₹45,360.00
      expect(formatRupees(amt3)).toBe("₹45,360.00");
    });

    it("satisfies the proportional fractional moisture cases: 12.1% -> 9990, 13.5% -> 9850", () => {
      // 12.1% moisture on 10,000 tenths (1000.0 kg) with 0 tare
      // 12.1% is 0.1% above 12.0% -> 1 permille deduction
      // 10,000 * 999 / 1000 = 9990
      const net121 = netWeightX10(10000, 0, 121);
      expect(net121).toBe(9990);

      // 13.5% moisture on 10,000 tenths with 0 tare
      // 13.5% is 1.5% above 12.0% -> 15 permille deduction
      // 10,000 * 985 / 1000 = 9850
      const net135 = netWeightX10(10000, 0, 135);
      expect(net135).toBe(9850);
    });

    it("enforces strict input limits (gross <= 50,000 kg, moisture <= 50.0%)", () => {
      // Gross > 50,000 kg (500,001 tenths) throws
      expect(() => netWeightX10(500001, 0, 120)).toThrow("Input out of range");

      // Moisture > 50.0% (501 tenths) throws
      expect(() => netWeightX10(10000, 0, 501)).toThrow("Input out of range");

      // Negative moisture throws
      expect(() => netWeightX10(10000, 0, -1)).toThrow("Input out of range");

      // Tare > gross throws
      expect(() => netWeightX10(100, 200, 120)).toThrow("Tare exceeds gross");
    });

    it("verifies server recomputation endpoint enforces exact arithmetic and rejects alterations", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/purchases/recompute",
        payload: {
          grossX10: 12500,
          tareX10: 180,
          moistureX10: 115,
          ratePaise: 485000,
          claimedNetX10: 12320,
          claimedAmountPaise: 5975200,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().valid).toBe(true);

      // Tampered claimed amount is caught
      const tamperedRes = await app.inject({
        method: "POST",
        url: "/purchases/recompute",
        payload: {
          grossX10: 12500,
          tareX10: 180,
          moistureX10: 115,
          ratePaise: 485000,
          claimedNetX10: 12320,
          claimedAmountPaise: 6000000, // Altered!
        },
      });

      expect(tamperedRes.statusCode).toBe(400);
      expect(tamperedRes.json().valid).toBe(false);
      expect(tamperedRes.json().reason).toBe("CALCULATION_MISMATCH");
    });
  });

  describe("3. Security, Privacy & DPDP Compliance Hardening (§16)", () => {
    it("proves Aadhaar is NEVER stored or present in schema columns", () => {
      const memberColumns = Object.keys(schema.members);
      const purchaseColumns = Object.keys(schema.purchases);
      const userColumns = Object.keys(schema.users);

      expect(memberColumns.some((col) => col.toLowerCase().includes("aadhaar"))).toBe(false);
      expect(purchaseColumns.some((col) => col.toLowerCase().includes("aadhaar"))).toBe(false);
      expect(userColumns.some((col) => col.toLowerCase().includes("aadhaar"))).toBe(false);
    });

    it("verifies bank accounts are encrypted with AES-GCM-256 at rest", async () => {
      const member = await db.query.members.findFirst({
        where: eq(schema.members.id, "member-1"),
      });

      expect(member).toBeDefined();
      expect(member?.bankAccountEnc).toBeDefined();
      // Should not be raw plain text
      expect(member?.bankAccountEnc).not.toBe("1234567890");
      // Decrypt succeeds and recovers masked account
      const decrypted = decryptBank(member!.bankAccountEnc);
      expect(decrypted.length).toBeGreaterThanOrEqual(8);
    });

    it("verifies member snapshot is immutable and shields payment run from later bank edits", async () => {
      // 1. Create and sync purchase for member-4
      const entry = await createSignedPurchase({
        memberId: "member-4",
      });

      const syncRes = await app.inject({
        method: "POST",
        url: "/sync/purchases",
        cookies: { session: operatorSession },
        payload: {
          deviceId: testDeviceId,
          entries: [entry],
        },
      });
      expect(syncRes.statusCode).toBe(200);
      expect(syncRes.json().results[0].status).toBe("accepted");

      // 2. Inspect captured snapshot
      const savedPurchase = await db.query.purchases.findFirst({
        where: eq(schema.purchases.id, entry.id),
      });
      expect(savedPurchase).toBeDefined();
      expect(savedPurchase?.memberSnapshotJson).toBeDefined();

      const snapshot = JSON.parse(decryptBank(savedPurchase!.memberSnapshotJson));
      expect(snapshot).toHaveProperty("name");
      expect(snapshot).toHaveProperty("ifsc");
      expect(snapshot).toHaveProperty("bankAccount");
      const originalAccount = snapshot.bankAccount;

      // 3. Office edits member's live bank account
      await app.inject({
        method: "PATCH",
        url: "/members/member-4",
        cookies: { session: officeSession },
        payload: {
          bankAccount: "999988887777",
        },
      });

      // 4. Generate payment run and verify bank file uses snapshot account, not live row
      const runRes = await app.inject({
        method: "POST",
        url: "/payment-runs",
        cookies: { session: officeSession },
        payload: { purchaseIds: [entry.id] },
      });
      expect(runRes.statusCode).toBe(201);
      const runId = runRes.json().runId;

      const fileRes = await app.inject({
        method: "GET",
        url: `/payment-runs/${runId}/file`,
        cookies: { session: officeSession },
      });
      expect(fileRes.statusCode).toBe(200);
      const csv = fileRes.body;

      // CSV contains the original snapshot account, NOT the newly edited account
      expect(csv).toContain(originalAccount);
      expect(csv).not.toContain("999988887777");
    });
  });
});
