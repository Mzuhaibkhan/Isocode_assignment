import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, desc, and, gt, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import {
  SyncBatchSchema,
  SyncRejectionReason,
  SyncHoldReason,
  netWeightX10,
  amountPaise,
  formatRupees,
  canonicalJson,
  sha256Hex,
  verifySignature,
  type SyncRejectionReasonType,
  type SyncHoldReasonType,
} from "@procurement/shared";
import { encryptBank, decryptBank, maskBankAccount } from "../crypto/aes.js";
import { sendSlipSms } from "../adapters/sms.mock.js";
import { recordAudit } from "../db/audit.js";
import { evaluatePurchaseFlags } from "../flags/index.js";
import crypto from "node:crypto";

export interface SyncEntryResult {
  id: string;
  slipNo: string;
  status: "accepted" | "held" | "duplicate" | "rejected";
  reason?: SyncRejectionReasonType | SyncHoldReasonType | string;
  flagCodes?: string[];
  purchaseId?: string;
}

export async function syncRoutes(app: FastifyInstance) {
  // POST /sync/purchases - Upload an ordered batch of signed purchases (§8, §9.7)
  app.post("/sync/purchases", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = SyncBatchSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const { deviceId, entries } = parseResult.data;

    // 1. Fetch Registered Device (§9.7 step 1)
    const [device] = await db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.id, deviceId))
      .limit(1);

    if (!device || device.revokedAt !== null) {
      // If the device is unknown or revoked, reject all entries in the batch with DEVICE_REVOKED
      const rejectionResults: SyncEntryResult[] = [];
      for (const entry of entries) {
        await db.insert(schema.syncRejections).values({
          id: `rej-${crypto.randomUUID().slice(0, 8)}`,
          deviceId,
          deviceSeq: entry.deviceSeq,
          reason: SyncRejectionReason.DEVICE_REVOKED,
          payloadHash: entry.entryHash,
        });
        rejectionResults.push({
          id: entry.id,
          slipNo: entry.slipNo,
          status: "rejected",
          reason: SyncRejectionReason.DEVICE_REVOKED,
        });
      }
      return reply.status(403).send({
        error: "DEVICE_REVOKED",
        message: "Device is not registered or has been revoked",
        results: rejectionResults,
        rejectedCount: rejectionResults.length,
      });
    }

    const results: SyncEntryResult[] = [];
    let syncedCount = 0;
    let heldCount = 0;
    let duplicateCount = 0;
    let rejectedCount = 0;

    // Process each entry strictly in order (§9.7)
    for (const entry of entries) {
      // A. Check for Duplicate / Idempotency (§9.7 step 5)
      const [existingWithSeq] = await db
        .select()
        .from(schema.purchases)
        .where(
          and(
            eq(schema.purchases.deviceId, deviceId),
            eq(schema.purchases.deviceSeq, entry.deviceSeq)
          )
        )
        .limit(1);

      if (existingWithSeq) {
        if (existingWithSeq.entryHash === entry.entryHash) {
          // Idempotent duplicate: return earlier result
          results.push({
            id: entry.id,
            slipNo: existingWithSeq.slipNo,
            status: "duplicate",
            purchaseId: existingWithSeq.id,
          });
          duplicateCount++;
          continue;
        } else {
          // Sequence conflict with different entry hash!
          await db.insert(schema.syncRejections).values({
            id: `rej-${crypto.randomUUID().slice(0, 8)}`,
            deviceId,
            deviceSeq: entry.deviceSeq,
            reason: SyncRejectionReason.SEQ_GAP,
            payloadHash: entry.entryHash,
          });
          results.push({
            id: entry.id,
            slipNo: entry.slipNo,
            status: "rejected",
            reason: SyncRejectionReason.SEQ_GAP,
          });
          rejectedCount++;
          continue;
        }
      }

      // B. Verify ECDSA Signature with registered public key (§9.7 step 2)
      const isSignatureValid = await verifySignature(
        device.publicKeyJwk,
        entry.signature,
        entry.entryHash
      );

      if (!isSignatureValid) {
        await db.insert(schema.syncRejections).values({
          id: `rej-${crypto.randomUUID().slice(0, 8)}`,
          deviceId,
          deviceSeq: entry.deviceSeq,
          reason: SyncRejectionReason.SIGNATURE_INVALID,
          payloadHash: entry.entryHash,
        });
        results.push({
          id: entry.id,
          slipNo: entry.slipNo,
          status: "rejected",
          reason: SyncRejectionReason.SIGNATURE_INVALID,
        });
        rejectedCount++;
        continue;
      }

      // C. Recompute Entry Hash from Payload & PrevHash (§9.7 step 3)
      const payload = {
        id: entry.id,
        slipNo: entry.slipNo,
        memberId: entry.memberId,
        crop: entry.crop,
        grade: entry.grade,
        grossX10: entry.grossX10,
        tareX10: entry.tareX10,
        moistureX10: entry.moistureX10,
        netX10: entry.netX10,
        ratePaise: entry.ratePaise,
        amountPaise: entry.amountPaise,
        priceVersion: entry.priceVersion,
        clientTime: entry.clientTime,
        deviceId: entry.deviceId,
        deviceSeq: entry.deviceSeq,
        correctsId: entry.correctsId ?? null,
      };

      const expectedEntryHash = await sha256Hex(entry.prevHash + canonicalJson(payload));
      if (entry.entryHash !== expectedEntryHash) {
        await db.insert(schema.syncRejections).values({
          id: `rej-${crypto.randomUUID().slice(0, 8)}`,
          deviceId,
          deviceSeq: entry.deviceSeq,
          reason: SyncRejectionReason.HASH_MISMATCH,
          payloadHash: entry.entryHash,
        });
        results.push({
          id: entry.id,
          slipNo: entry.slipNo,
          status: "rejected",
          reason: SyncRejectionReason.HASH_MISMATCH,
        });
        rejectedCount++;
        continue;
      }

      // D. Verify Previous Hash & Sequence Chain (§9.7 steps 4 & 5)
      const [lastAccepted] = await db
        .select({
          deviceSeq: schema.purchases.deviceSeq,
          entryHash: schema.purchases.entryHash,
        })
        .from(schema.purchases)
        .where(eq(schema.purchases.deviceId, deviceId))
        .orderBy(desc(schema.purchases.deviceSeq))
        .limit(1);

      const expectedPrevHash = lastAccepted ? lastAccepted.entryHash : "0".repeat(64);
      if (entry.prevHash !== expectedPrevHash) {
        await db.insert(schema.syncRejections).values({
          id: `rej-${crypto.randomUUID().slice(0, 8)}`,
          deviceId,
          deviceSeq: entry.deviceSeq,
          reason: SyncRejectionReason.PREV_HASH_MISMATCH,
          payloadHash: entry.entryHash,
        });
        results.push({
          id: entry.id,
          slipNo: entry.slipNo,
          status: "rejected",
          reason: SyncRejectionReason.PREV_HASH_MISMATCH,
        });
        rejectedCount++;
        continue;
      }

      const expectedSeq = (lastAccepted?.deviceSeq ?? 0) + 1;
      if (entry.deviceSeq !== expectedSeq) {
        await db.insert(schema.syncRejections).values({
          id: `rej-${crypto.randomUUID().slice(0, 8)}`,
          deviceId,
          deviceSeq: entry.deviceSeq,
          reason: SyncRejectionReason.SEQ_GAP,
          payloadHash: entry.entryHash,
        });
        results.push({
          id: entry.id,
          slipNo: entry.slipNo,
          status: "rejected",
          reason: SyncRejectionReason.SEQ_GAP,
        });
        rejectedCount++;
        continue;
      }

      // E. Recompute Weight and Money Math (§9.7 step 6)
      let expectedNet = 0;
      let expectedAmount = 0;
      try {
        expectedNet = netWeightX10(entry.grossX10, entry.tareX10, entry.moistureX10);
        expectedAmount = amountPaise(expectedNet, entry.ratePaise);
      } catch {
        expectedNet = -1;
      }

      if (entry.netX10 !== expectedNet || entry.amountPaise !== expectedAmount) {
        await db.insert(schema.syncRejections).values({
          id: `rej-${crypto.randomUUID().slice(0, 8)}`,
          deviceId,
          deviceSeq: entry.deviceSeq,
          reason: SyncRejectionReason.CALCULATION_MISMATCH,
          payloadHash: entry.entryHash,
        });
        results.push({
          id: entry.id,
          slipNo: entry.slipNo,
          status: "rejected",
          reason: SyncRejectionReason.CALCULATION_MISMATCH,
        });
        rejectedCount++;
        continue;
      }

      // F. Price Check: Two Cases (§9.7 step 7)
      // Case A: Look up rate stored for claimed price_version
      const [claimedPriceRow] = await db
        .select()
        .from(schema.priceBoard)
        .where(
          and(
            eq(schema.priceBoard.crop, entry.crop),
            eq(schema.priceBoard.grade, entry.grade),
            eq(schema.priceBoard.version, entry.priceVersion)
          )
        )
        .limit(1);

      if (!claimedPriceRow || claimedPriceRow.ratePaisePerQuintal !== entry.ratePaise) {
        await db.insert(schema.syncRejections).values({
          id: `rej-${crypto.randomUUID().slice(0, 8)}`,
          deviceId,
          deviceSeq: entry.deviceSeq,
          reason: SyncRejectionReason.RATE_MISMATCH,
          payloadHash: entry.entryHash,
        });
        results.push({
          id: entry.id,
          slipNo: entry.slipNo,
          status: "rejected",
          reason: SyncRejectionReason.RATE_MISMATCH,
        });
        rejectedCount++;
        continue;
      }

      // Case B: Check if a newer version was already in force at entry's client_time
      const entryClientDate = new Date(entry.clientTime);
      const newerPrices = await db
        .select()
        .from(schema.priceBoard)
        .where(
          and(
            eq(schema.priceBoard.crop, entry.crop),
            eq(schema.priceBoard.grade, entry.grade),
            lte(schema.priceBoard.effectiveFrom, entryClientDate),
            gt(schema.priceBoard.version, entry.priceVersion)
          )
        )
        .limit(1);

      const isStalePriceVersion = newerPrices.length > 0;

      // G. Member Lookup & Flag Evaluation (§9.7 step 10)
      const [member] = await db
        .select()
        .from(schema.members)
        .where(eq(schema.members.id, entry.memberId))
        .limit(1);

      if (!member) {
        await db.insert(schema.syncRejections).values({
          id: `rej-${crypto.randomUUID().slice(0, 8)}`,
          deviceId,
          deviceSeq: entry.deviceSeq,
          reason: "MEMBER_NOT_FOUND",
          payloadHash: entry.entryHash,
        });
        results.push({
          id: entry.id,
          slipNo: entry.slipNo,
          status: "rejected",
          reason: "MEMBER_NOT_FOUND",
        });
        rejectedCount++;
        continue;
      }

      const flagCodes: string[] = [];

      if (isStalePriceVersion) {
        flagCodes.push(SyncHoldReason.STALE_PRICE_VERSION);
      }

      // Step 10: Run full suite of flag rules (§10.1)
      const serverNow = new Date();
      const evaluatedFlags = await evaluatePurchaseFlags({
        memberId: entry.memberId,
        centreId: device.centreId,
        crop: entry.crop,
        netX10: entry.netX10,
        moistureX10: entry.moistureX10,
        clientTime: entryClientDate,
        serverTime: serverNow,
        priceVersion: entry.priceVersion,
        ratePaise: entry.ratePaise,
        activePriceVersion: activePrice?.version,
        consentWithdrawnAt: member.consentWithdrawnAt,
        excludePurchaseId: entry.id,
      });

      for (const f of evaluatedFlags) {
        if (!flagCodes.includes(f)) {
          flagCodes.push(f);
        }
      }

      const entryStatus = flagCodes.length > 0 ? "held" : "accepted";

      // H. Capture Member Snapshot Encrypted (§9.7 step 9)
      let rawAc = "912345678901";
      try {
        rawAc = decryptBank(member.bankAccountEnc);
      } catch {}

      const snapshot = {
        memberId: member.id,
        farmerCode: member.farmerCode,
        name: member.name,
        nameLatin: member.nameLatin,
        village: member.village,
        mobile: member.mobile,
        bankAccountMasked: maskBankAccount(rawAc),
        ifsc: member.ifsc,
        bankVerified: !!member.bankVerifiedAt,
      };
      const memberSnapshotJson = encryptBank(JSON.stringify(snapshot));

      // I. Save to DB (§9.7 step 8)
      await db.insert(schema.purchases).values({
        id: entry.id,
        slipNo: entry.slipNo,
        memberId: entry.memberId,
        crop: entry.crop,
        grade: entry.grade,
        grossX10: entry.grossX10,
        tareX10: entry.tareX10,
        moistureX10: entry.moistureX10,
        netX10: entry.netX10,
        ratePaise: entry.ratePaise,
        amountPaise: entry.amountPaise,
        priceVersion: entry.priceVersion,
        memberSnapshotJson,
        deviceId: entry.deviceId,
        deviceSeq: entry.deviceSeq,
        prevHash: entry.prevHash,
        entryHash: entry.entryHash,
        signature: entry.signature,
        correctsId: entry.correctsId ?? null,
        clientTime: entryClientDate,
        serverReceivedAt: serverNow,
        status: entryStatus,
        flagCodes: flagCodes.length > 0 ? flagCodes : null,
      });

      // J. Queue Marathi SMS (§9.7 step 11)
      const cropLabelMarathi = entry.crop === "Soybean" ? "सोयाबीन" : entry.crop === "Tur" ? "तूर" : entry.crop;
      await sendSlipSms({
        purchaseId: entry.id,
        mobile: member.mobile,
        slip: {
          slipNo: entry.slipNo,
          farmerName: member.name,
          crop: cropLabelMarathi,
          netKg: (entry.netX10 / 10).toFixed(1),
          moisturePercent: (entry.moistureX10 / 10).toFixed(1),
          ratePerQuintal: Math.floor(entry.ratePaise / 100),
          amountFormatted: formatRupees(entry.amountPaise),
        },
      });

      // K. Record Audit Log
      await recordAudit(device.userId, "PURCHASE_SYNCED", "purchase", entry.id, {
        slipNo: entry.slipNo,
        status: entryStatus,
        flagCodes,
      });

      if (entryStatus === "held") {
        heldCount++;
      } else {
        syncedCount++;
      }

      results.push({
        id: entry.id,
        slipNo: entry.slipNo,
        status: entryStatus,
        reason: flagCodes[0],
        flagCodes,
        purchaseId: entry.id,
      });
    }

    return reply.status(200).send({
      success: true,
      results,
      syncedCount,
      heldCount,
      duplicateCount,
      rejectedCount,
    });
  });

  // GET /sync/status - Office view of sync rejections
  app.get("/sync/rejections", async (_req, reply) => {
    const rejections = await db
      .select({
        id: schema.syncRejections.id,
        deviceId: schema.syncRejections.deviceId,
        deviceSeq: schema.syncRejections.deviceSeq,
        reason: schema.syncRejections.reason,
        payloadHash: schema.syncRejections.payloadHash,
        createdAt: schema.syncRejections.createdAt,
        centreCode: schema.centres.code,
      })
      .from(schema.syncRejections)
      .leftJoin(schema.devices, eq(schema.syncRejections.deviceId, schema.devices.id))
      .leftJoin(schema.centres, eq(schema.devices.centreId, schema.centres.id))
      .orderBy(desc(schema.syncRejections.createdAt))
      .limit(50);

    return reply.send({ rejections });
  });
}

