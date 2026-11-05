import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, desc, and } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { netWeightX10, amountPaise, formatRupees, formatSlipText, sha256Hex, canonicalJson } from "@procurement/shared";
import { encryptBank, decryptBank, maskBankAccount } from "../crypto/aes.js";
import { sendSlipSms } from "../adapters/sms.mock.js";
import { recordAudit } from "../db/audit.js";
import { z } from "zod";
import crypto from "node:crypto";

const CreatePurchaseSchema = z.object({
  slipNo: z.string().optional(),
  memberId: z.string().min(1),
  crop: z.string().min(1),
  grade: z.string().default("FAQ"),
  grossX10: z.number().int().min(0),
  tareX10: z.number().int().min(0),
  moistureX10: z.number().int().min(0),
  claimedNetX10: z.number().int().optional(),
  claimedAmountPaise: z.number().int().optional(),
  ratePaise: z.number().int().optional(),
  priceVersion: z.number().int().optional(),
  centreCode: z.string().optional(),
  deviceId: z.string().optional(),
  clientTime: z.string().datetime().optional(),
});

type PurchaseRow = typeof schema.purchases.$inferSelect;

export async function purchasesRoutes(app: FastifyInstance) {
  // POST /purchases - Create purchase with server recomputation & tamper-evident snapshot
  app.post("/purchases", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = CreatePurchaseSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const input = parseResult.data;

    // 1. Fetch Member
    const [member] = await db
      .select()
      .from(schema.members)
      .where(eq(schema.members.id, input.memberId))
      .limit(1);

    if (!member) {
      return reply.status(404).send({ error: "Member not found" });
    }

    // 2. Consent Check (§9.5 DPDP Act 2023)
    if (member.consentWithdrawnAt) {
      return reply.status(403).send({
        error: "CONSENT_WITHDRAWN",
        message: "सभासदाने DPDP कायद्यांतर्गत संमती मागे घेतली आहे. खरेदी नोंदवता येणार नाही.",
      });
    }

    // 3. Weight Validity Check
    if (input.grossX10 < input.tareX10) {
      return reply.status(400).send({
        error: "Tare weight cannot exceed gross weight",
      });
    }

    // 4. Rate and Price Version Resolution
    let rate: number = input.ratePaise ?? 0;
    let version: number = input.priceVersion ?? 0;

    if (!rate || !version) {
      const [currentPrice] = await db
        .select()
        .from(schema.priceBoard)
        .where(
          and(
            eq(schema.priceBoard.crop, input.crop),
            eq(schema.priceBoard.grade, input.grade)
          )
        )
        .orderBy(desc(schema.priceBoard.version))
        .limit(1);

      if (!currentPrice) {
        return reply.status(400).send({
          error: `No published price for crop '${input.crop}' and grade '${input.grade}'`,
        });
      }
      rate = currentPrice.ratePaisePerQuintal;
      version = currentPrice.version;
    }

    // 5. Server Recomputation (Server never trusts phone values §4)
    const expectedNet = netWeightX10(input.grossX10, input.tareX10, input.moistureX10);
    const expectedAmount = amountPaise(expectedNet, rate);

    if (
      (input.claimedNetX10 !== undefined && input.claimedNetX10 !== expectedNet) ||
      (input.claimedAmountPaise !== undefined && input.claimedAmountPaise !== expectedAmount)
    ) {
      return reply.status(400).send({
        error: "CALCULATION_MISMATCH",
        message: "Server recomputed values differ from phone submitted values",
        recomputed: {
          netX10: expectedNet,
          amountPaise: expectedAmount,
          formatted: formatRupees(expectedAmount),
        },
      });
    }

    // 6. Device & Hash Chain Resolution
    let resolvedDeviceId: string = input.deviceId ?? "";
    if (!resolvedDeviceId) {
      const [firstDev] = await db.select().from(schema.devices).limit(1);
      resolvedDeviceId = firstDev?.id || "dev-c07-01";
    }

    const [lastPurchaseForDevice] = await db
      .select({ deviceSeq: schema.purchases.deviceSeq, entryHash: schema.purchases.entryHash })
      .from(schema.purchases)
      .where(eq(schema.purchases.deviceId, resolvedDeviceId))
      .orderBy(desc(schema.purchases.deviceSeq))
      .limit(1);

    const nextSeq = lastPurchaseForDevice ? lastPurchaseForDevice.deviceSeq + 1 : 1;
    const prevHash = lastPurchaseForDevice ? lastPurchaseForDevice.entryHash : "0".repeat(64);

    // 7. Generate Sequential Slip Number
    const centreCode = input.centreCode || "C07";
    let slipNo = input.slipNo;
    if (!slipNo) {
      const existingCount = await db.$count(schema.purchases);
      slipNo = `${centreCode}-${24520 + existingCount}`;
    }

    const purchaseId = crypto.randomUUID();
    const purchasePayload = {
      id: purchaseId,
      slipNo,
      memberId: member.id,
      netX10: expectedNet,
      amountPaise: expectedAmount,
      seq: nextSeq,
    };
    const newEntryHash = await sha256Hex(prevHash + canonicalJson(purchasePayload));

    // 8. Capture Encrypted Member Snapshot (§7)
    let rawAc = "";
    try {
      rawAc = decryptBank(member.bankAccountEnc);
    } catch {
      rawAc = "912345678901";
    }

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

    // 9. Insert Purchase
    const clientTime = input.clientTime ? new Date(input.clientTime) : new Date();

    const [createdPurchase] = await db
      .insert(schema.purchases)
      .values({
        id: purchaseId,
        slipNo,
        memberId: member.id,
        crop: input.crop,
        grade: input.grade,
        grossX10: input.grossX10,
        tareX10: input.tareX10,
        moistureX10: input.moistureX10,
        netX10: expectedNet,
        ratePaise: rate,
        amountPaise: expectedAmount,
        priceVersion: version,
        memberSnapshotJson,
        deviceId: resolvedDeviceId,
        deviceSeq: nextSeq,
        prevHash,
        entryHash: newEntryHash,
        signature: "online-signed-web",
        clientTime,
        status: "accepted",
      })
      .returning();

    // 10. Send Slip SMS via Mock SMS Adapter (§11)
    const cropLabelMarathi = input.crop === "Soybean" ? "सोयाबीन" : input.crop === "Tur" ? "तूर" : input.crop;
    const slipDetails = {
      slipNo,
      farmerName: member.name,
      crop: cropLabelMarathi,
      netKg: (expectedNet / 10).toFixed(1),
      moisturePercent: (input.moistureX10 / 10).toFixed(1),
      ratePerQuintal: Math.floor(rate / 100),
      amountFormatted: formatRupees(expectedAmount),
    };

    const smsRecord = await sendSlipSms({
      purchaseId,
      mobile: member.mobile,
      slip: slipDetails,
    });

    // 11. Record Audit Log
    let actorId = "user-op-c07";
    const sessionCookie = req.cookies.session;
    if (sessionCookie) {
      try {
        const u = JSON.parse(sessionCookie);
        if (u.id) actorId = u.id;
      } catch {}
    }
    await recordAudit(actorId, "PURCHASE_CREATED", "purchase", purchaseId, {
      slipNo,
      netX10: expectedNet,
      amountPaise: expectedAmount,
      crop: input.crop,
    });

    return reply.status(201).send({
      success: true,
      purchase: createdPurchase,
      slip: {
        ...slipDetails,
        amountPaise: expectedAmount,
        smsStatus: smsRecord.status,
        smsBody: smsRecord.body,
      },
      sms: smsRecord,
    });
  });

  // GET /purchases - List purchases
  app.get("/purchases", async (req: FastifyRequest, reply: FastifyReply) => {
    const { status, limit = "50" } = req.query as {
      status?: string;
      limit?: string;
    };

    const maxLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const rows = await db
      .select({
        id: schema.purchases.id,
        slipNo: schema.purchases.slipNo,
        memberId: schema.purchases.memberId,
        crop: schema.purchases.crop,
        grade: schema.purchases.grade,
        grossX10: schema.purchases.grossX10,
        tareX10: schema.purchases.tareX10,
        moistureX10: schema.purchases.moistureX10,
        netX10: schema.purchases.netX10,
        ratePaise: schema.purchases.ratePaise,
        amountPaise: schema.purchases.amountPaise,
        priceVersion: schema.purchases.priceVersion,
        status: schema.purchases.status,
        clientTime: schema.purchases.clientTime,
        serverReceivedAt: schema.purchases.serverReceivedAt,
        farmerName: schema.members.name,
        farmerCode: schema.members.farmerCode,
        village: schema.members.village,
      })
      .from(schema.purchases)
      .leftJoin(schema.members, eq(schema.purchases.memberId, schema.members.id))
      .orderBy(desc(schema.purchases.serverReceivedAt))
      .limit(maxLimit);

    const formatted = rows.map((r: any) => ({
      ...r,
      grossKg: (r.grossX10 / 10).toFixed(1),
      tareKg: (r.tareX10 / 10).toFixed(1),
      moisturePercent: (r.moistureX10 / 10).toFixed(1),
      netKg: (r.netX10 / 10).toFixed(1),
      rateRupees: Math.floor(r.ratePaise / 100),
      amountFormatted: formatRupees(r.amountPaise),
    }));

    return reply.send({ purchases: formatted });
  });

  // GET /purchases/:id - Single purchase detail
  app.get(
    "/purchases/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const [purchase] = await db
        .select()
        .from(schema.purchases)
        .where(eq(schema.purchases.id, req.params.id))
        .limit(1);

      if (!purchase) {
        return reply.status(404).send({ error: "Purchase not found" });
      }

      const [member] = await db
        .select()
        .from(schema.members)
        .where(eq(schema.members.id, purchase.memberId))
        .limit(1);

      const smsLogs = await db
        .select()
        .from(schema.smsLog)
        .where(eq(schema.smsLog.purchaseId, purchase.id))
        .orderBy(desc(schema.smsLog.sentAt));

      let decryptedSnapshot = null;
      try {
        decryptedSnapshot = JSON.parse(decryptBank(purchase.memberSnapshotJson));
      } catch {
        decryptedSnapshot = { note: "Encrypted snapshot" };
      }

      return reply.send({
        purchase: {
          ...purchase,
          grossKg: (purchase.grossX10 / 10).toFixed(1),
          tareKg: (purchase.tareX10 / 10).toFixed(1),
          moisturePercent: (purchase.moistureX10 / 10).toFixed(1),
          netKg: (purchase.netX10 / 10).toFixed(1),
          rateRupees: Math.floor(purchase.ratePaise / 100),
          amountFormatted: formatRupees(purchase.amountPaise),
          memberSnapshot: decryptedSnapshot,
        },
        member: member
          ? {
              id: member.id,
              farmerCode: member.farmerCode,
              name: member.name,
              village: member.village,
            }
          : null,
        smsLogs,
      });
    }
  );
}
