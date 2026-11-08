import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, desc, and } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { requireAuth } from "./auth.js";
import { recordAudit } from "../db/audit.js";
import { PriceBoardCreateSchema, formatRupees } from "@procurement/shared";

type PriceRow = typeof schema.priceBoard.$inferSelect;

export async function pricesRoutes(app: FastifyInstance) {
  // GET /prices/current - Get active price board (any authenticated role)
  app.get(
    "/prices/current",
    { preHandler: requireAuth(["operator", "office_manager"]) },
    async (_req: FastifyRequest, reply: FastifyReply) => {
    const rows: PriceRow[] = await db
      .select()
      .from(schema.priceBoard)
      .orderBy(desc(schema.priceBoard.effectiveFrom), desc(schema.priceBoard.version));

    // Deduplicate by crop + grade taking the newest effective row
    const seen = new Set<string>();
    const currentPrices = [];

    for (const r of rows) {
      const key = `${r.crop}-${r.grade}`;
      if (!seen.has(key)) {
        seen.add(key);
        currentPrices.push({
          ...r,
          rateRupees: r.ratePaisePerQuintal / 100,
          rateFormatted: formatRupees(r.ratePaisePerQuintal),
        });
      }
    }

    return reply.send({ prices: currentPrices });
    }
  );

  // GET /prices/history - Complete price board history (any authenticated role)
  app.get(
    "/prices/history",
    { preHandler: requireAuth(["operator", "office_manager"]) },
    async (_req: FastifyRequest, reply: FastifyReply) => {
    const history: PriceRow[] = await db
      .select()
      .from(schema.priceBoard)
      .orderBy(desc(schema.priceBoard.createdAt));

    const formatted = history.map((h: PriceRow) => ({
      ...h,
      rateRupees: h.ratePaisePerQuintal / 100,
      rateFormatted: formatRupees(h.ratePaisePerQuintal),
    }));

    return reply.send({ history: formatted });
    }
  );

  // POST /prices - Publish new price (Office Manager only)
  app.post(
    "/prices",
    { preHandler: requireAuth(["office_manager"]) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = PriceBoardCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      const { crop, grade, ratePaisePerQuintal, effectiveFrom } = parsed.data;

      // Find highest version for this crop & grade
      const existing = await db
        .select({ version: schema.priceBoard.version })
        .from(schema.priceBoard)
        .where(
          and(
            eq(schema.priceBoard.crop, crop),
            eq(schema.priceBoard.grade, grade)
          )
        )
        .orderBy(desc(schema.priceBoard.version))
        .limit(1);

      const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;
      const id = `price-${Date.now()}`;
      const effectiveDate = effectiveFrom ? new Date(effectiveFrom) : new Date();

      await db.insert(schema.priceBoard).values({
        id,
        crop,
        grade,
        ratePaisePerQuintal,
        effectiveFrom: effectiveDate,
        version: nextVersion,
        setBy: req.user!.id,
      });

      await recordAudit(req.user!.id, "PRICE_PUBLISHED", "price_board", id, {
        crop,
        grade,
        ratePaisePerQuintal,
        version: nextVersion,
      });

      return reply.status(201).send({
        success: true,
        price: {
          id,
          crop,
          grade,
          ratePaisePerQuintal,
          rateRupees: ratePaisePerQuintal / 100,
          rateFormatted: formatRupees(ratePaisePerQuintal),
          version: nextVersion,
          effectiveFrom: effectiveDate,
        },
      });
    }
  );
}
