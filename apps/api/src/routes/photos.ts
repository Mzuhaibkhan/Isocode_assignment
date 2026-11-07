import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { readDisplayPhoto } from "../adapters/photoReader.claude.js";
import crypto from "node:crypto";

const PhotoReadRequestSchema = z.object({
  kind: z.enum(["scale", "meter"]),
  image: z.string().min(1),
  purchaseId: z.string().uuid().optional(),
  typedValueX10: z.number().int().optional(),
});

export async function photosRoutes(app: FastifyInstance) {
  // POST /photos/read - Read 7-segment or LCD meter display (§8, §10.2)
  app.post("/photos/read", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = PhotoReadRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const { kind, image, purchaseId, typedValueX10 } = parseResult.data;

    try {
      const reading = await readDisplayPhoto(image, kind);

      // If attached to an existing purchase, record in purchase_photos
      if (purchaseId && typedValueX10 !== undefined) {
        const matched = reading.valueX10 !== null && reading.valueX10 === typedValueX10;
        const storageKey = `photos/${purchaseId}/${kind}-${Date.now()}.jpg`;

        await db.insert(schema.purchasePhotos).values({
          id: `photo-${crypto.randomUUID().slice(0, 8)}`,
          purchaseId,
          kind,
          storageKey,
          aiValueX10: reading.valueX10,
          typedValueX10,
          matched,
          aiNote: reading.note,
        });
      }

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
  });
}

