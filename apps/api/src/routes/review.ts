import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, desc, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { recordAudit } from "../db/audit.js";
import { requireAuth } from "./auth.js";
import { formatRupees } from "@procurement/shared";
import { z } from "zod";

const ReviewActionSchema = z.object({
  note: z.string().optional(),
  reason: z.string().optional(),
});

export async function reviewRoutes(app: FastifyInstance) {
  // GET /review/flagged - List all flagged and held purchases (§8, §10.1)
  app.get(
    "/review/flagged",
    { preHandler: requireAuth(["office_manager"]) },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const heldPurchases = await db
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
          flagCodes: schema.purchases.flagCodes,
          clientTime: schema.purchases.clientTime,
          serverReceivedAt: schema.purchases.serverReceivedAt,
          farmerName: schema.members.name,
          farmerCode: schema.members.farmerCode,
          village: schema.members.village,
          mobile: schema.members.mobile,
          landTenthsAcre: schema.members.landTenthsAcre,
          bankVerified: schema.members.bankVerifiedAt,
          consentWithdrawn: schema.members.consentWithdrawnAt,
          centreCode: schema.centres.code,
          centreName: schema.centres.name,
        })
        .from(schema.purchases)
        .innerJoin(schema.members, eq(schema.purchases.memberId, schema.members.id))
        .leftJoin(schema.devices, eq(schema.purchases.deviceId, schema.devices.id))
        .leftJoin(schema.centres, eq(schema.devices.centreId, schema.centres.id))
        .where(eq(schema.purchases.status, "held"))
        .orderBy(desc(schema.purchases.serverReceivedAt));

      // Fetch attached photos for each held purchase
      const purchaseIds = heldPurchases.map((p: any) => p.id);
      let photos: any[] = [];
      if (purchaseIds.length > 0) {
        photos = await db
          .select()
          .from(schema.purchasePhotos)
          .where(inArray(schema.purchasePhotos.purchaseId, purchaseIds));
      }

      const formatted = heldPurchases.map((p: any) => ({
        ...p,
        amountFormatted: formatRupees(p.amountPaise),
        netKg: (p.netX10 / 10).toFixed(1),
        moisturePercent: (p.moistureX10 / 10).toFixed(1),
        ratePerQuintal: Math.floor(p.ratePaise / 100),
        photos: photos.filter((ph) => ph.purchaseId === p.id),
      }));

      return reply.send({
        heldPurchases: formatted,
        count: formatted.length,
      });
    }
  );

  // POST /review/:id/release - Release payment hold and approve purchase (§8, §10.1)
  app.post(
    "/review/:id/release",
    { preHandler: requireAuth(["office_manager"]) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const parsed = ReviewActionSchema.safeParse(req.body || {});
      const note = parsed.success ? parsed.data.note : undefined;

      const [purchase] = await db
        .select()
        .from(schema.purchases)
        .where(eq(schema.purchases.id, id))
        .limit(1);

      if (!purchase) {
        return reply.status(404).send({ error: "Purchase not found" });
      }

      // Update status to 'approved'
      await db
        .update(schema.purchases)
        .set({ status: "approved" })
        .where(eq(schema.purchases.id, id));

      const userId = req.user?.id || "user-office-1";
      await recordAudit(userId, "PURCHASE_RELEASED", "purchase", id, {
        note: note || "Released by office manager",
        previousStatus: purchase.status,
        newStatus: "approved",
        flagCodes: purchase.flagCodes,
      });

      return reply.send({
        success: true,
        id,
        status: "approved",
        message: "Payment hold released successfully",
      });
    }
  );

  // POST /review/:id/hold - Maintain or update payment hold (§8, §10.1)
  app.post(
    "/review/:id/hold",
    { preHandler: requireAuth(["office_manager"]) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const parsed = ReviewActionSchema.safeParse(req.body || {});
      const { note, reason } = parsed.success ? parsed.data : { note: undefined, reason: undefined };

      const [purchase] = await db
        .select()
        .from(schema.purchases)
        .where(eq(schema.purchases.id, id))
        .limit(1);

      if (!purchase) {
        return reply.status(404).send({ error: "Purchase not found" });
      }

      const userId = req.user?.id || "user-office-1";
      await recordAudit(userId, "PURCHASE_HELD", "purchase", id, {
        note: note || "Hold confirmed by office manager",
        reason: reason || purchase.flagCodes?.[0] || "MANUAL_HOLD",
        status: "held",
      });

      return reply.send({
        success: true,
        id,
        status: "held",
        message: "Hold maintained with audit record",
      });
    }
  );
}

