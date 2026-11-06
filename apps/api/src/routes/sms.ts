import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { requireAuth } from "./auth.js";

export async function smsRoutes(app: FastifyInstance) {
  // GET /sms-log - List logged SMS messages for office transparency (§11)
  app.get(
    "/sms-log",
    { preHandler: requireAuth(["office_manager", "operator"]) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { limit = "50", purchaseId } = req.query as {
        limit?: string;
        purchaseId?: string;
      };

      const maxLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

      const query = db
        .select({
          id: schema.smsLog.id,
          purchaseId: schema.smsLog.purchaseId,
          toMobileMasked: schema.smsLog.toMobileMasked,
          body: schema.smsLog.body,
          status: schema.smsLog.status,
          sentAt: schema.smsLog.sentAt,
          slipNo: schema.purchases.slipNo,
          crop: schema.purchases.crop,
        })
        .from(schema.smsLog)
        .leftJoin(schema.purchases, eq(schema.smsLog.purchaseId, schema.purchases.id))
        .orderBy(desc(schema.smsLog.sentAt))
        .limit(maxLimit);

      if (purchaseId) {
        query.where(eq(schema.smsLog.purchaseId, purchaseId));
      }

      const rows = await query;
      return reply.send({ messages: rows });
    }
  );

  // GET /sms-log/:id - Single SMS detail
  app.get<{ Params: { id: string } }>(
    "/sms-log/:id",
    { preHandler: requireAuth(["office_manager", "operator"]) },
    async (req, reply) => {
      const [record] = await db
        .select()
        .from(schema.smsLog)
        .where(eq(schema.smsLog.id, req.params.id))
        .limit(1);

      if (!record) {
        return reply.status(404).send({ error: "SMS log not found" });
      }

      return reply.send({ message: record });
    }
  );
}
