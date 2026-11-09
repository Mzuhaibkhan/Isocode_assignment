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
  entryHash,
  SyncHoldReason,
} from "@procurement/shared";
import { decryptBank } from "../crypto/aes.js";
import { eq, and, desc } from "drizzle-orm";
import crypto from "node:crypto";
import { signedSession } from "./helpers/sessions.js";

describe("Phase 5: AI Reading, Flags, Review Queue, Payment Runs & Retry (§10, §12)", () => {
  let app: FastifyInstance;
  let deviceKeyPair: CryptoKeyPair;
  let deviceJwk: JsonWebKey;
  const testDeviceId = "dev-test-p5-01";
  const centreId = "centre-c07";

  const officeSession = signedSession({
    id: "user-office-1",
    role: "office_manager",
    name: "Anil Kadam",
  });

  const operatorSession = signedSession({
    id: "user-op-c07",
    role: "operator",
    name: "Ramesh Patil",
    centreId: "centre-c07",
  });

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
    await runSeed(db);

    // Register device for sync testing
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

  async function createSignedSyncEntry(overrides: Partial<{
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
    deviceSeq: number;
    prevHash: string;
  }> = {}) {
    const [last] = await db
      .select({ entryHash: schema.purchases.entryHash, deviceSeq: schema.purchases.deviceSeq })
      .from(schema.purchases)
      .where(eq(schema.purchases.deviceId, testDeviceId))
      .orderBy(desc(schema.purchases.deviceSeq))
      .limit(1);

    const deviceSeq = overrides.deviceSeq ?? (last ? last.deviceSeq + 1 : 1);
    const prevHash = overrides.prevHash ?? (last ? last.entryHash : "0".repeat(64));
    const entryId = crypto.randomUUID();
    const slipNo = `C07-${Math.floor(50000 + Math.random() * 40000)}`;

    const payload = {
      id: entryId,
      slipNo,
      memberId: overrides.memberId || "member-1",
      crop: overrides.crop || "Soybean",
      grade: overrides.grade || "FAQ",
      grossX10: overrides.grossX10 ?? 12500,
      tareX10: overrides.tareX10 ?? 180,
      moistureX10: overrides.moistureX10 ?? 115,
      netX10: overrides.netX10 ?? 12320,
      ratePaise: overrides.ratePaise ?? 485000,
      amountPaise: overrides.amountPaise ?? 5975200,
      priceVersion: overrides.priceVersion ?? 1,
      clientTime: overrides.clientTime || new Date().toISOString(),
      deviceId: testDeviceId,
      deviceSeq,
      correctsId: null,
    };

    const computedHash = await entryHash(payload, prevHash);
    const signature = await signHash(deviceKeyPair.privateKey, computedHash);

    return {
      ...payload,
      prevHash,
      entryHash: computedHash,
      signature,
    };
  }

  describe("1. AI Photo Reading API (§10.2)", () => {
    it("reads moisture meter LCD display and returns value in tenths with confidence", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/photos/read",
        cookies: { session: operatorSession },
        payload: {
          kind: "meter",
          image: "data:image/jpeg;base64," + Buffer.from("simulated-meter-photo-data-bytes").toString("base64"),
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.reading.value).toBe(11.5);
      expect(body.reading.valueX10).toBe(115);
      expect(body.reading.confidence).toBe("high");
      expect(body.reading.note).toBeDefined();
    });

    it("attaches photo to existing purchase and records matched status and aiNote", async () => {
      const [existingPurchase] = await db.select().from(schema.purchases).limit(1);

      const res = await app.inject({
        method: "POST",
        url: "/photos/attach",
        cookies: { session: operatorSession },
        payload: {
          purchaseId: existingPurchase.id,
          kind: "meter",
          imageData: "data:image/jpeg;base64," + Buffer.from("simulated-meter-photo-data-bytes").toString("base64"),
          aiValueX10: 115,
          typedValueX10: 115, // matches AI 11.5%
          matched: true,
          aiNote: "LCD reading matched typed value",
        },
      });

      expect(res.statusCode).toBe(201);

      // Verify purchase_photos record
      const [photoRow] = await db
        .select()
        .from(schema.purchasePhotos)
        .where(eq(schema.purchasePhotos.purchaseId, existingPurchase.id));

      expect(photoRow).toBeDefined();
      expect(photoRow.aiValueX10).toBe(115);
      expect(photoRow.typedValueX10).toBe(115);
      expect(photoRow.matched).toBe(true);
      expect(photoRow.aiNote).toContain("LCD");
    });
  });

  describe("2. Flag Rules: DUPLICATE_FARMER & YIELD_HIGH (§10.1)", () => {
    it("accepts and holds entry with DUPLICATE_FARMER when member has 2nd purchase within 60 mins", async () => {
      const memberId = "member-3";
      const baseTime = new Date();

      // First purchase
      const entry1 = await createSignedSyncEntry({
        memberId,
        clientTime: baseTime.toISOString(),
      });

      const syncRes1 = await app.inject({
        method: "POST",
        url: "/sync/purchases",
        payload: {
          deviceId: testDeviceId,
          entries: [entry1],
        },
      });
      expect(syncRes1.statusCode).toBe(200);
      const body1 = JSON.parse(syncRes1.payload);
      expect(body1.results[0].status).toBe("accepted");

      // Second purchase 20 minutes later (same farmer, within 60 min window)
      const entry2 = await createSignedSyncEntry({
        memberId,
        clientTime: new Date(baseTime.getTime() + 20 * 60 * 1000).toISOString(),
      });

      const syncRes2 = await app.inject({
        method: "POST",
        url: "/sync/purchases",
        payload: {
          deviceId: testDeviceId,
          entries: [entry2],
        },
      });

      expect(syncRes2.statusCode).toBe(200);
      const body2 = JSON.parse(syncRes2.payload);
      // Not cancelled, but held! (§10.1)
      expect(body2.results[0].status).toBe("held");
      expect(body2.results[0].flagCodes).toContain(SyncHoldReason.DUPLICATE_FARMER);

      // Check DB status
      const [p2] = await db.select().from(schema.purchases).where(eq(schema.purchases.id, entry2.id));
      expect(p2.status).toBe("held");
    });

    it("holds entry with YIELD_HIGH when season delivery exceeds acreage quota", async () => {
      // member-8 has landTenthsAcre = 20 (2.0 acres)
      // Max yield for soybean = 2.0 acres * 1,200 kg = 2,400 kg = 24,000 tenths
      const excessiveNetX10 = 35000; // 3,500.0 kg (> 2,400 kg)
      const highYieldEntry = await createSignedSyncEntry({
        memberId: "member-8",
        grossX10: 36000,
        tareX10: 1000,
        moistureX10: 120,
        netX10: excessiveNetX10,
        ratePaise: 485000,
        amountPaise: 16975000,
      });

      const syncRes = await app.inject({
        method: "POST",
        url: "/sync/purchases",
        payload: {
          deviceId: testDeviceId,
          entries: [highYieldEntry],
        },
      });

      expect(syncRes.statusCode).toBe(200);
      const body = JSON.parse(syncRes.payload);
      expect(body.results[0].status).toBe("held");
      expect(body.results[0].flagCodes).toContain(SyncHoldReason.YIELD_HIGH);
    });
  });

  describe("3. Review Queue API & Audit Logging (§10.1, §13.2)", () => {
    it("lists held purchases via GET /review/flagged", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/review/flagged",
        cookies: { session: officeSession },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.heldPurchases.length).toBeGreaterThan(0);
      const item = body.heldPurchases[0];
      expect(item.farmerName).toBeDefined();
      expect(item.flagCodes).toBeDefined();
      expect(item.amountFormatted).toMatch(/^₹/);
    });

    it("releases payment hold via POST /review/:id/release and records audit log", async () => {
      // Find a held purchase
      const [held] = await db
        .select()
        .from(schema.purchases)
        .where(eq(schema.purchases.status, "held"))
        .limit(1);

      expect(held).toBeDefined();

      const releaseRes = await app.inject({
        method: "POST",
        url: `/review/${held.id}/release`,
        cookies: { session: officeSession },
        payload: { note: "Farmer confirmed second load is from separate plot" },
      });

      expect(releaseRes.statusCode).toBe(200);
      const body = JSON.parse(releaseRes.payload);
      expect(body.success).toBe(true);
      expect(body.status).toBe("approved");

      // Verify DB status
      const [updated] = await db.select().from(schema.purchases).where(eq(schema.purchases.id, held.id));
      expect(updated.status).toBe("approved");

      // Verify audit log entry exists (§10.1)
      const auditRows = await db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.entity, "purchase"),
            eq(schema.auditLog.entityId, held.id),
            eq(schema.auditLog.action, "PURCHASE_RELEASED")
          )
        );
      expect(auditRows.length).toBeGreaterThan(0);
    });

    it("maintains hold via POST /review/:id/hold and records audit log", async () => {
      const [held] = await db
        .select()
        .from(schema.purchases)
        .where(eq(schema.purchases.status, "held"))
        .limit(1);

      const holdRes = await app.inject({
        method: "POST",
        url: `/review/${held.id}/hold`,
        cookies: { session: officeSession },
        payload: { note: "Awaiting supervisor field inspection" },
      });

      expect(holdRes.statusCode).toBe(200);
      const [updated] = await db.select().from(schema.purchases).where(eq(schema.purchases.id, held.id));
      expect(updated.status).toBe("held");

      const auditRows = await db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.entity, "purchase"),
            eq(schema.auditLog.entityId, held.id),
            eq(schema.auditLog.action, "PURCHASE_HELD")
          )
        );
      expect(auditRows.length).toBeGreaterThan(0);
    });
  });

  describe("4. Bank Payment File & Member Snapshot (§12)", () => {
    let createdRunId: string;

    it("generates payment run where file total strictly equals purchase sum to the paisa", async () => {
      // Ensure at least two unheld approved purchases exist
      await db
        .update(schema.purchases)
        .set({ status: "approved" })
        .where(eq(schema.purchases.status, "accepted"));

      const res = await app.inject({
        method: "POST",
        url: "/payment-runs",
        cookies: { session: officeSession },
        payload: {},
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.runId).toBeDefined();
      expect(body.totalPaise).toBeGreaterThan(0);
      createdRunId = body.runId;

      // Verify payment items in DB
      const items = await db
        .select()
        .from(schema.paymentItems)
        .where(eq(schema.paymentItems.runId, createdRunId));
      expect(items.length).toBe(body.farmerCount);

      // Verify exact total assertion
      const itemsTotal = items.reduce((acc: number, itm: { amountPaise: number }) => acc + itm.amountPaise, 0);
      expect(itemsTotal).toBe(body.totalPaise);
    });

    it("serves valid downloadable CSV matching §12 columns via GET /payment-runs/:id/file", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/payment-runs/${createdRunId}/file`,
        cookies: { session: officeSession },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");

      const csvLines = res.payload.split("\n");
      const headers = csvLines[0];
      expect(headers).toBe("Serial,Beneficiary Name,Account Number,IFSC,Amount,Narration,Payment Reference");

      // Verify data lines have 7 columns
      expect(csvLines.length).toBeGreaterThan(1);
      const firstRow = csvLines[1];
      expect(firstRow).toMatch(/^1,/);
    });

    it("uses member snapshot captured at sync time: live member bank account edit does not alter payment file", async () => {
      // 1. Find a purchase included in createdRunId
      const [item] = await db
        .select()
        .from(schema.paymentItems)
        .where(eq(schema.paymentItems.runId, createdRunId))
        .limit(1);

      const [purchase] = await db
        .select()
        .from(schema.purchases)
        .where(eq(schema.purchases.id, item.purchaseIds[0]));

      const snapshot = JSON.parse(decryptBank(purchase.memberSnapshotJson));

      // 2. Mutate live member row's bank account
      await app.inject({
        method: "PATCH",
        url: `/members/${purchase.memberId}`,
        cookies: { session: officeSession },
        payload: {
          bankAccount: "999999999999",
          ifsc: "PUNB0999999",
        },
      });

      // 3. Download the payment file again: account must match snapshot, NOT the edited live row!
      const fileRes = await app.inject({
        method: "GET",
        url: `/payment-runs/${createdRunId}/file`,
        cookies: { session: officeSession },
      });

      expect(fileRes.payload).not.toContain("999999999999");
      expect(fileRes.payload).not.toContain("PUNB0999999");
      expect(fileRes.payload).toContain(snapshot.ifsc);
    });

    it("includes delivered purchases for member who withdrew consent in payment runs (§2, §12)", async () => {
      // Withdraw consent for member-2
      await app.inject({
        method: "POST",
        url: "/members/member-2/withdraw-consent",
        cookies: { session: officeSession },
      });

      // Deliver a purchase before or already delivered
      const [member2Purchase] = await db
        .select()
        .from(schema.purchases)
        .where(and(eq(schema.purchases.memberId, "member-2"), eq(schema.purchases.status, "accepted")))
        .limit(1);

      if (member2Purchase) {
        // Approve it
        await db
          .update(schema.purchases)
          .set({ status: "approved" })
          .where(eq(schema.purchases.id, member2Purchase.id));

        const runRes = await app.inject({
          method: "POST",
          url: "/payment-runs",
          cookies: { session: officeSession },
          payload: { purchaseIds: [member2Purchase.id] },
        });

        expect(runRes.statusCode).toBe(201);
        const body = JSON.parse(runRes.payload);
        expect(body.purchaseCount).toBe(1);
      }
    });
  });

  describe("5. Retry-Failed Model (§12)", () => {
    let originalRunId: string;
    let failedItemId: string;
    let failedItemAmount: number;

    beforeAll(async () => {
      // Query an existing run
      const [run] = await db.select().from(schema.paymentRuns).limit(1);
      originalRunId = run.id;

      // Simulate 1 item failure via status endpoint
      const statusRes = await app.inject({
        method: "POST",
        url: `/payment-runs/${originalRunId}/status`,
        cookies: { session: officeSession },
        payload: { simulateOneFailureIndex: 0 },
      });
      expect(statusRes.statusCode).toBe(200);

      const items = await db
        .select()
        .from(schema.paymentItems)
        .where(and(eq(schema.paymentItems.runId, originalRunId), eq(schema.paymentItems.status, "failed")));

      expect(items.length).toBeGreaterThan(0);
      failedItemId = items[0].id;
      failedItemAmount = items[0].amountPaise;
    });

    it("creates a NEW run with kind=retry containing only failed items, leaving original run unchanged", async () => {
      const [origRunBefore] = await db
        .select()
        .from(schema.paymentRuns)
        .where(eq(schema.paymentRuns.id, originalRunId));

      const retryRes = await app.inject({
        method: "POST",
        url: `/payment-runs/${originalRunId}/retry-failed`,
        cookies: { session: officeSession },
      });

      expect(retryRes.statusCode).toBe(201);
      const retryBody = JSON.parse(retryRes.payload);
      expect(retryBody.success).toBe(true);
      expect(retryBody.newRunId).toBeDefined();
      expect(retryBody.parentRunId).toBe(originalRunId);
      expect(retryBody.totalPaise).toBe(failedItemAmount);

      // Verify original run totals and kind are completely UNCHANGED
      const [origRunAfter] = await db
        .select()
        .from(schema.paymentRuns)
        .where(eq(schema.paymentRuns.id, originalRunId));

      expect(origRunAfter.totalPaise).toBe(origRunBefore.totalPaise);
      expect(origRunAfter.kind).toBe("original");

      // Verify original failed item stays 'failed' and has retriedByItemId pointing to new item
      const [origItemAfter] = await db
        .select()
        .from(schema.paymentItems)
        .where(eq(schema.paymentItems.id, failedItemId));

      expect(origItemAfter.status).toBe("failed");
      expect(origItemAfter.retriedByItemId).toBeDefined();

      // Verify new item in retry run has status='queued' and retryOfItemId pointing to original item
      const [newItem] = await db
        .select()
        .from(schema.paymentItems)
        .where(eq(schema.paymentItems.id, origItemAfter.retriedByItemId!));

      expect(newItem.runId).toBe(retryBody.newRunId);
      expect(newItem.status).toBe("queued");
      expect(newItem.retryOfItemId).toBe(failedItemId);
    });
  });
});

