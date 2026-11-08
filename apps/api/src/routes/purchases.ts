import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { formatRupees } from "@procurement/shared";
import { requireAuth } from "./auth.js";

// Note: the legacy unauthenticated POST /purchases was removed. All purchase
// creation now flows exclusively through POST /sync/purchases, where entries
// are device-signed and hash-chained, so the ledger can never be corrupted by
// an unsigned "online-signed-web" insert.

export async function purchasesRoutes(app: FastifyInstance) {
  // GET /purchases - List purchases (any authenticated role)
  app.get(
    "/purchases",
    { preHandler: requireAuth(["operator", "office_manager"]) },
    async (req: FastifyRequest, reply: FastifyReply) => {
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
    }
  );

  // GET /purchases/:id - Single purchase detail.
  // The encrypted member snapshot is never decrypted for the client (§7 DPDP).
  app.get(
    "/purchases/:id",
    { preHandler: requireAuth(["operator", "office_manager"]) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const [purchase] = await db
        .select()
        .from(schema.purchases)
        .where(eq(schema.purchases.id, id))
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

      return reply.send({
        purchase: {
          ...purchase,
          grossKg: (purchase.grossX10 / 10).toFixed(1),
          tareKg: (purchase.tareX10 / 10).toFixed(1),
          moisturePercent: (purchase.moistureX10 / 10).toFixed(1),
          netKg: (purchase.netX10 / 10).toFixed(1),
          rateRupees: Math.floor(purchase.ratePaise / 100),
          amountFormatted: formatRupees(purchase.amountPaise),
          memberSnapshotEncrypted: true,
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
