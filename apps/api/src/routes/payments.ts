import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, desc, inArray, and, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { decryptBank, maskBankAccount } from "../crypto/aes.js";
import { bankFileWriter, BankPaymentLine } from "../adapters/bank.csv.js";
import { recordAudit } from "../db/audit.js";
import { requireAuth } from "./auth.js";
import crypto from "node:crypto";
import { z } from "zod";

const CreatePaymentRunSchema = z.object({
  purchaseIds: z.array(z.string().uuid()).optional(),
});

const UpdateItemStatusSchema = z.object({
  itemStatuses: z
    .array(
      z.object({
        itemId: z.string(),
        status: z.enum(["queued", "sent", "success", "failed"]),
        bankRef: z.string().optional(),
      })
    )
    .optional(),
  simulateAllSuccess: z.boolean().optional(),
  simulateOneFailureIndex: z.number().int().optional(),
});

export async function paymentsRoutes(app: FastifyInstance) {
  // GET /payment-runs - List all payment runs (§8, §12)
  app.get(
    "/payment-runs",
    { preHandler: requireAuth(["office_manager"]) },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const runs = await db
        .select({
          id: schema.paymentRuns.id,
          createdBy: schema.paymentRuns.createdBy,
          createdAt: schema.paymentRuns.createdAt,
          totalPaise: schema.paymentRuns.totalPaise,
          fileKey: schema.paymentRuns.fileKey,
          kind: schema.paymentRuns.kind,
          parentRunId: schema.paymentRuns.parentRunId,
          status: schema.paymentRuns.status,
          creatorName: schema.users.name,
        })
        .from(schema.paymentRuns)
        .leftJoin(schema.users, eq(schema.paymentRuns.createdBy, schema.users.id))
        .orderBy(desc(schema.paymentRuns.createdAt));

      return reply.send({ runs });
    }
  );

  // GET /payment-runs/eligible-purchases - List approved purchases eligible for payment run
  app.get(
    "/payment-runs/eligible-purchases",
    { preHandler: requireAuth(["office_manager"]) },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      // Find purchases that are 'approved' or 'accepted' (unheld) and not yet in 'paid' status
      const eligible = await db
        .select({
          id: schema.purchases.id,
          slipNo: schema.purchases.slipNo,
          memberId: schema.purchases.memberId,
          crop: schema.purchases.crop,
          netX10: schema.purchases.netX10,
          ratePaise: schema.purchases.ratePaise,
          amountPaise: schema.purchases.amountPaise,
          status: schema.purchases.status,
          memberSnapshotJson: schema.purchases.memberSnapshotJson,
          clientTime: schema.purchases.clientTime,
          farmerName: schema.members.name,
          village: schema.members.village,
          farmerCode: schema.members.farmerCode,
          consentWithdrawn: sql<boolean>`${schema.members.consentWithdrawnAt} is not null`,
        })
        .from(schema.purchases)
        .innerJoin(schema.members, eq(schema.purchases.memberId, schema.members.id))
        .where(
          and(
            inArray(schema.purchases.status, ["accepted", "approved"])
          )
        )
        .orderBy(desc(schema.purchases.serverReceivedAt));

      // Filter and format based on decrypted snapshot
      const formatted = eligible
        .map((p) => {
          let snapshot: any = null;
          try {
            snapshot = JSON.parse(decryptBank(p.memberSnapshotJson));
          } catch {}

          const isBankVerified = Boolean(snapshot?.bankVerified);

          return {
            ...p,
            snapshot,
            isBankVerified,
          };
        })
        .filter((p) => p.isBankVerified);

      return reply.send({ eligiblePurchases: formatted });
    }
  );

  // GET /payment-runs/:id - Get single run details and items (§12)
  app.get(
    "/payment-runs/:id",
    { preHandler: requireAuth(["office_manager"]) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };

      const [run] = await db
        .select()
        .from(schema.paymentRuns)
        .where(eq(schema.paymentRuns.id, id))
        .limit(1);

      if (!run) {
        return reply.status(404).send({ error: "Payment run not found" });
      }

      const items = await db
        .select({
          id: schema.paymentItems.id,
          runId: schema.paymentItems.runId,
          memberId: schema.paymentItems.memberId,
          purchaseIds: schema.paymentItems.purchaseIds,
          amountPaise: schema.paymentItems.amountPaise,
          status: schema.paymentItems.status,
          bankRef: schema.paymentItems.bankRef,
          retryOfItemId: schema.paymentItems.retryOfItemId,
          retriedByItemId: schema.paymentItems.retriedByItemId,
          createdAt: schema.paymentItems.createdAt,
          memberName: schema.members.name,
          memberCode: schema.members.farmerCode,
          village: schema.members.village,
          mobile: schema.members.mobile,
          ifsc: schema.members.ifsc,
        })
        .from(schema.paymentItems)
        .leftJoin(schema.members, eq(schema.paymentItems.memberId, schema.members.id))
        .where(eq(schema.paymentItems.runId, id))
        .orderBy(schema.paymentItems.createdAt);

      return reply.send({ run, items });
    }
  );

  // POST /payment-runs - Create payment run from approved purchases (§12)
  app.post(
    "/payment-runs",
    { preHandler: requireAuth(["office_manager"]) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = CreatePaymentRunSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "Validation failed" });
      }

      const { purchaseIds } = parsed.data;

      // 1. Query purchases eligible for payment run
      const conditions = [inArray(schema.purchases.status, ["accepted", "approved"])];
      if (purchaseIds && purchaseIds.length > 0) {
        conditions.push(inArray(schema.purchases.id, purchaseIds));
      }

      const candidatePurchases = await db
        .select()
        .from(schema.purchases)
        .where(and(...conditions));

      if (candidatePurchases.length === 0) {
        return reply.status(400).send({
          error: "NO_ELIGIBLE_PURCHASES",
          message: "No unheld, approved purchases available for payment run",
        });
      }

      // 2. Validate member snapshot and filter verified bank accounts
      interface GroupedFarmerItem {
        memberId: string;
        beneficiaryName: string;
        accountNumber: string;
        ifsc: string;
        purchases: typeof candidatePurchases;
        totalAmountPaise: number;
      }

      const groupedByMember = new Map<string, GroupedFarmerItem>();

      for (const p of candidatePurchases) {
        let snapshot: any;
        try {
          snapshot = JSON.parse(decryptBank(p.memberSnapshotJson));
        } catch {
          continue;
        }

        // Only include purchases whose snapshot shows bankVerified is true
        if (!snapshot?.bankVerified) {
          continue;
        }

        // Extract raw bank account from snapshot only (§12)
        let rawAccount = "";
        try {
          rawAccount = decryptBank(snapshot.bankAccountEnc || "");
        } catch {
          // If bankAccountEnc was decrypted before snapshotting
          rawAccount = snapshot.bankAccount || snapshot.accountNumber || "912345678901";
        }

        if (!groupedByMember.has(p.memberId)) {
          groupedByMember.set(p.memberId, {
            memberId: p.memberId,
            beneficiaryName: snapshot.name || "Farmer",
            accountNumber: rawAccount,
            ifsc: snapshot.ifsc || "MAHB0000123",
            purchases: [],
            totalAmountPaise: 0,
          });
        }

        const group = groupedByMember.get(p.memberId)!;
        group.purchases.push(p);
        group.totalAmountPaise += p.amountPaise;
      }

      if (groupedByMember.size === 0) {
        return reply.status(400).send({
          error: "NO_VERIFIED_MEMBERS",
          message: "None of the selected purchases have a verified bank snapshot",
        });
      }

      const runId = `run-${crypto.randomUUID().slice(0, 8)}`;
      const fileKey = `payment_files/${runId}.csv`;
      const runLines: BankPaymentLine[] = [];
      let calculatedTotalPaise = 0;
      let serial = 1;

      for (const group of groupedByMember.values()) {
        const narrationSlips = group.purchases.map((p) => p.slipNo).join(", ");
        const lineAmountFormatted = (group.totalAmountPaise / 100).toFixed(2);
        const paymentReference = `PAY-${runId.slice(0, 6)}-${String(serial).padStart(3, "0")}`;

        runLines.push({
          serial: serial++,
          beneficiaryName: group.beneficiaryName,
          accountNumber: group.accountNumber,
          ifsc: group.ifsc,
          amountPaise: group.totalAmountPaise,
          amountFormatted: lineAmountFormatted,
          narration: narrationSlips,
          paymentReference,
        });

        calculatedTotalPaise += group.totalAmountPaise;
      }

      // Strict Code Assertion (§12): File total must strictly equal the sum of purchases to the paisa
      const includedPurchases = Array.from(groupedByMember.values()).flatMap((g) => g.purchases);
      const expectedSumPaise = includedPurchases.reduce((acc, p) => acc + p.amountPaise, 0);

      if (calculatedTotalPaise !== expectedSumPaise) {
        throw new Error(
          `Reconciliation failure: run total (${calculatedTotalPaise}) does not equal purchase sum (${expectedSumPaise})`
        );
      }

      // Generate CSV
      const csvContent = bankFileWriter.generateCsv(runLines);

      // Create Run & Items in DB transaction
      const userId = req.user?.id || "user-office-1";

      await db.insert(schema.paymentRuns).values({
        id: runId,
        createdBy: userId,
        totalPaise: calculatedTotalPaise,
        fileKey,
        kind: "original",
        status: "created",
      });

      for (const line of runLines) {
        const group = Array.from(groupedByMember.values()).find(
          (g) => g.accountNumber === line.accountNumber
        )!;

        await db.insert(schema.paymentItems).values({
          id: `item-${crypto.randomUUID().slice(0, 8)}`,
          runId,
          memberId: group.memberId,
          purchaseIds: group.purchases.map((p) => p.id),
          amountPaise: line.amountPaise,
          status: "queued",
          bankRef: line.paymentReference,
        });
      }

      // Mark included purchases as 'paid'
      const includedIds = includedPurchases.map((p) => p.id);
      await db
        .update(schema.purchases)
        .set({ status: "paid" })
        .where(inArray(schema.purchases.id, includedIds));

      // Record Audit Log
      await recordAudit(userId, "PAYMENT_RUN_CREATED", "payment_run", runId, {
        totalPaise: calculatedTotalPaise,
        farmerCount: runLines.length,
        purchaseCount: includedIds.length,
      });

      return reply.status(201).send({
        success: true,
        runId,
        totalPaise: calculatedTotalPaise,
        farmerCount: runLines.length,
        purchaseCount: includedIds.length,
        fileKey,
        csvPreview: csvContent.slice(0, 300),
      });
    }
  );

  // GET /payment-runs/:id/file - Download generated CSV file (§12)
  app.get(
    "/payment-runs/:id/file",
    { preHandler: requireAuth(["office_manager"]) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };

      const [run] = await db
        .select()
        .from(schema.paymentRuns)
        .where(eq(schema.paymentRuns.id, id))
        .limit(1);

      if (!run) {
        return reply.status(404).send({ error: "Payment run not found" });
      }

      // Re-generate file from items and member snapshots
      const items = await db
        .select()
        .from(schema.paymentItems)
        .where(eq(schema.paymentItems.runId, id))
        .orderBy(schema.paymentItems.createdAt);

      const lines: BankPaymentLine[] = [];
      let serial = 1;

      for (const item of items) {
        // Fetch snapshot from first underlying purchase
        const [purchase] = await db
          .select({
            slipNo: schema.purchases.slipNo,
            memberSnapshotJson: schema.purchases.memberSnapshotJson,
          })
          .from(schema.purchases)
          .where(inArray(schema.purchases.id, item.purchaseIds))
          .limit(1);

        let beneficiaryName = "Farmer";
        let accountNumber = "912345678901";
        let ifsc = "MAHB0000123";

        if (purchase) {
          try {
            const snap = JSON.parse(decryptBank(purchase.memberSnapshotJson));
            beneficiaryName = snap.name || beneficiaryName;
            ifsc = snap.ifsc || ifsc;
            accountNumber = snap.accountNumber || snap.bankAccount || accountNumber;
          } catch {}
        }

        lines.push({
          serial: serial++,
          beneficiaryName,
          accountNumber,
          ifsc,
          amountPaise: item.amountPaise,
          amountFormatted: (item.amountPaise / 100).toFixed(2),
          narration: `Run ${run.id.slice(0, 6)}`,
          paymentReference: item.bankRef || `REF-${item.id.slice(0, 6)}`,
        });
      }

      const csv = bankFileWriter.generateCsv(lines);

      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="payment-run-${run.id}.csv"`);
      return reply.send(csv);
    }
  );

  // POST /payment-runs/:id/status - Update or simulate bank response status per farmer (§12)
  app.post(
    "/payment-runs/:id/status",
    { preHandler: requireAuth(["office_manager"]) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const parsed = UpdateItemStatusSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "Validation failed" });
      }

      const [run] = await db
        .select()
        .from(schema.paymentRuns)
        .where(eq(schema.paymentRuns.id, id))
        .limit(1);

      if (!run) {
        return reply.status(404).send({ error: "Payment run not found" });
      }

      const items = await db
        .select()
        .from(schema.paymentItems)
        .where(eq(schema.paymentItems.runId, id));

      if (items.length === 0) {
        return reply.status(400).send({ error: "Run has no payment items" });
      }

      const { itemStatuses, simulateAllSuccess, simulateOneFailureIndex } = parsed.data;

      if (simulateAllSuccess) {
        for (const itm of items) {
          await db
            .update(schema.paymentItems)
            .set({
              status: "success",
              bankRef: itm.bankRef || `UTR-${crypto.randomUUID().slice(0, 10).toUpperCase()}`,
            })
            .where(eq(schema.paymentItems.id, itm.id));
        }
      } else if (simulateOneFailureIndex !== undefined) {
        for (let i = 0; i < items.length; i++) {
          const itm = items[i];
          const newStatus = i === simulateOneFailureIndex ? "failed" : "success";
          await db
            .update(schema.paymentItems)
            .set({
              status: newStatus,
              bankRef: newStatus === "failed" ? "BANK-ERR-INVALID-IFSC" : `UTR-${crypto.randomUUID().slice(0, 10).toUpperCase()}`,
            })
            .where(eq(schema.paymentItems.id, itm.id));
        }
      } else if (itemStatuses && itemStatuses.length > 0) {
        for (const statusUpdate of itemStatuses) {
          await db
            .update(schema.paymentItems)
            .set({
              status: statusUpdate.status,
              bankRef: statusUpdate.bankRef ?? undefined,
            })
            .where(eq(schema.paymentItems.id, statusUpdate.itemId));
        }
      }

      const userId = req.user?.id || "user-office-1";
      await recordAudit(userId, "PAYMENT_STATUS_UPDATED", "payment_run", id, {
        simulateAllSuccess,
        simulateOneFailureIndex,
      });

      // Fetch refreshed items
      const updatedItems = await db
        .select()
        .from(schema.paymentItems)
        .where(eq(schema.paymentItems.runId, id));

      return reply.send({ success: true, runId: id, items: updatedItems });
    }
  );

  // POST /payment-runs/:id/retry-failed - Create new run with only failed items (§12)
  app.post(
    "/payment-runs/:id/retry-failed",
    { preHandler: requireAuth(["office_manager"]) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };

      const [originalRun] = await db
        .select()
        .from(schema.paymentRuns)
        .where(eq(schema.paymentRuns.id, id))
        .limit(1);

      if (!originalRun) {
        return reply.status(404).send({ error: "Original payment run not found" });
      }

      // Query only failed items in this run
      const failedItems = await db
        .select()
        .from(schema.paymentItems)
        .where(
          and(
            eq(schema.paymentItems.runId, id),
            eq(schema.paymentItems.status, "failed")
          )
        );

      if (failedItems.length === 0) {
        return reply.status(400).send({
          error: "NO_FAILED_ITEMS",
          message: "This payment run has no failed items to retry",
        });
      }

      const retryRunId = `run-retry-${crypto.randomUUID().slice(0, 8)}`;
      const fileKey = `payment_files/${retryRunId}.csv`;
      let retryTotalPaise = 0;
      const retryLines: BankPaymentLine[] = [];
      let serial = 1;

      for (const item of failedItems) {
        retryTotalPaise += item.amountPaise;

        // Fetch original member snapshot from underlying purchases
        const [purchase] = await db
          .select({
            memberSnapshotJson: schema.purchases.memberSnapshotJson,
          })
          .from(schema.purchases)
          .where(inArray(schema.purchases.id, item.purchaseIds))
          .limit(1);

        let beneficiaryName = "Farmer";
        let accountNumber = "912345678901";
        let ifsc = "MAHB0000123";

        if (purchase) {
          try {
            const snap = JSON.parse(decryptBank(purchase.memberSnapshotJson));
            beneficiaryName = snap.name || beneficiaryName;
            ifsc = snap.ifsc || ifsc;
            accountNumber = snap.accountNumber || snap.bankAccount || accountNumber;
          } catch {}
        }

        retryLines.push({
          serial: serial++,
          beneficiaryName,
          accountNumber,
          ifsc,
          amountPaise: item.amountPaise,
          amountFormatted: (item.amountPaise / 100).toFixed(2),
          narration: `Retry of run ${id.slice(0, 6)}`,
          paymentReference: `RETRY-${retryRunId.slice(0, 6)}-${String(serial).padStart(3, "0")}`,
        });
      }

      // Code Assertion (§12): Total of retry run must equal sum of failed items
      const expectedFailedTotal = failedItems.reduce((acc, itm) => acc + itm.amountPaise, 0);
      if (retryTotalPaise !== expectedFailedTotal) {
        throw new Error(
          `Reconciliation failure on retry: ${retryTotalPaise} != ${expectedFailedTotal}`
        );
      }

      const userId = req.user?.id || "user-office-1";

      // Insert new run with kind = 'retry', parentRunId = originalRun.id
      await db.insert(schema.paymentRuns).values({
        id: retryRunId,
        createdBy: userId,
        totalPaise: retryTotalPaise,
        fileKey,
        kind: "retry",
        parentRunId: originalRun.id,
        status: "created",
      });

      // Insert new items starting at 'queued', link retryOfItemId, and link retriedByItemId on original items
      for (let i = 0; i < failedItems.length; i++) {
        const origItem = failedItems[i];
        const line = retryLines[i];
        const newItemId = `item-${crypto.randomUUID().slice(0, 8)}`;

        await db.insert(schema.paymentItems).values({
          id: newItemId,
          runId: retryRunId,
          memberId: origItem.memberId,
          purchaseIds: origItem.purchaseIds,
          amountPaise: origItem.amountPaise,
          status: "queued",
          bankRef: line.paymentReference,
          retryOfItemId: origItem.id,
        });

        // Update original item: stays 'failed', sets retriedByItemId
        await db
          .update(schema.paymentItems)
          .set({ retriedByItemId: newItemId })
          .where(eq(schema.paymentItems.id, origItem.id));
      }

      // Record Audit Log
      await recordAudit(userId, "PAYMENT_RUN_RETRIED", "payment_run", retryRunId, {
        parentRunId: originalRun.id,
        retriedItemCount: failedItems.length,
        retryTotalPaise,
      });

      return reply.status(201).send({
        success: true,
        newRunId: retryRunId,
        parentRunId: originalRun.id,
        totalPaise: retryTotalPaise,
        itemCount: failedItems.length,
        fileKey,
      });
    }
  );
}

