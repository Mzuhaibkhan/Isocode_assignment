import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { readDisplayPhoto } from "../adapters/photoReader.claude.js";
import { requireAuth } from "./auth.js";
import crypto from "node:crypto";

const PhotoReadRequestSchema = z.object({
  kind: z.enum(["scale", "meter"]),
  image: z.string().min(1),
  typedValueX10: z.number().int().optional(),
});

// Photo evidence attached after the purchase has been accepted by the server,
// so the FK to purchases is always satisfied (§10.2).
const PhotoAttachRequestSchema = z.object({
  purchaseId: z.string().uuid(),
  kind: z.enum(["scale", "meter"]),
  imageData: z.string().min(1),
  aiValueX10: z.number().int().nullable().optional(),
  typedValueX10: z.number().int(),
  matched: z.boolean(),
  aiNote: z.string().optional(),
});

export async function photosRoutes(app: FastifyInstance) {
  // POST /photos/read - Read 7-segment or LCD meter display (§8, §10.2)
  app.post(
    "/photos/read",
    { preHandler: requireAuth(["operator"]) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = PhotoReadRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: parseResult.error.flatten(),
        });
      }

      const { kind, image } = parseResult.data;

      try {
        const reading = await readDisplayPhoto(image, kind);

        return reply.status(200).send({
          success: true,
          kind,
          reading,
        });
      } catch (err: any) {
        req.log.error(err, "Photo read failed");
        return reply.status(500).send({
          error: "PHOTO_READ_FAILED",
          message: err.message || "Failed to process display photo",
        });
      }
    }
  );

  // POST /photos/attach - Persist scale/meter photo evidence for an accepted
  // purchase, so the office review queue shows the actual display image (§10.2).
  app.post(
    "/photos/attach",
    { preHandler: requireAuth(["operator"]) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = PhotoAttachRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: parseResult.error.flatten(),
        });
      }

      const { purchaseId, kind, imageData, aiValueX10, typedValueX10, matched, aiNote } =
        parseResult.data;

      const [purchase] = await db
        .select({ id: schema.purchases.id })
        .from(schema.purchases)
        .where(eq(schema.purchases.id, purchaseId))
        .limit(1);

      if (!purchase) {
        return reply.status(404).send({
          error: "PURCHASE_NOT_FOUND",
          message: "Purchase must be synced before photos can be attached",
        });
      }

      const photoId = `photo-${crypto.randomUUID().slice(0, 8)}`;
      const storageKey = `photos/${purchaseId}/${kind}-${Date.now()}.jpg`;

      await db.insert(schema.purchasePhotos).values({
        id: photoId,
        purchaseId,
        kind,
        storageKey,
        aiValueX10,
        typedValueX10,
        matched,
        aiNote,
        imageData,
      });

      return reply.status(201).send({
        success: true,
        photoId,
        storageKey,
      });
    }
  );
}
