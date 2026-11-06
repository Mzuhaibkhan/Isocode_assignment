import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { DeviceRegisterSchema } from "@procurement/shared";
import { requireAuth } from "./auth.js";
import { recordAudit } from "../db/audit.js";
import crypto from "node:crypto";

export async function devicesRoutes(app: FastifyInstance) {
  // POST /devices/register - Register device public key (§9.1)
  app.post("/devices/register", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = DeviceRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    const { centreId, publicKeyJwk } = parsed.data;
    const deviceId = parsed.data.deviceId || `dev-${crypto.randomUUID().slice(0, 8)}`;

    // Resolve active user (operator or office manager)
    let userId = "user-op-c07";
    const sessionCookie = req.cookies.session;
    if (sessionCookie) {
      try {
        const u = JSON.parse(sessionCookie);
        if (u.id) userId = u.id;
      } catch {}
    }

    const [existing] = await db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.id, deviceId))
      .limit(1);

    const now = new Date();

    if (existing) {
      await db
        .update(schema.devices)
        .set({
          userId,
          centreId,
          publicKeyJwk,
          registeredAt: now,
          revokedAt: null,
          revokedBy: null,
          revocationReason: null,
        })
        .where(eq(schema.devices.id, deviceId));
    } else {
      await db.insert(schema.devices).values({
        id: deviceId,
        userId,
        centreId,
        publicKeyJwk,
        registeredAt: now,
        revokedAt: null,
      });
    }

    await recordAudit(userId, "DEVICE_REGISTERED", "device", deviceId, {
      centreId,
    });

    return reply.status(200).send({
      success: true,
      deviceId,
      registeredAt: now.toISOString(),
    });
  });

  // GET /devices - List registered devices (§8, §13.3)
  app.get(
    "/devices",
    { preHandler: requireAuth(["office_manager", "operator"]) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const rows = await db
        .select({
          id: schema.devices.id,
          userId: schema.devices.userId,
          centreId: schema.devices.centreId,
          registeredAt: schema.devices.registeredAt,
          revokedAt: schema.devices.revokedAt,
          revocationReason: schema.devices.revocationReason,
          centreCode: schema.centres.code,
          centreName: schema.centres.name,
          userName: schema.users.name,
        })
        .from(schema.devices)
        .leftJoin(schema.centres, eq(schema.devices.centreId, schema.centres.id))
        .leftJoin(schema.users, eq(schema.devices.userId, schema.users.id))
        .orderBy(desc(schema.devices.registeredAt));

      return reply.send({ devices: rows });
    }
  );

  // POST /devices/:id/revoke - Revoke a lost/compromised device (§8, §9.7)
  app.post<{ Params: { id: string } }>(
    "/devices/:id/revoke",
    { preHandler: requireAuth(["office_manager"]) },
    async (req, reply) => {
      const { id } = req.params;
      const { reason = "Manual revocation by office" } = (req.body as any) || {};

      const [device] = await db
        .select()
        .from(schema.devices)
        .where(eq(schema.devices.id, id))
        .limit(1);

      if (!device) {
        return reply.status(404).send({ error: "Device not found" });
      }

      const now = new Date();
      await db
        .update(schema.devices)
        .set({
          revokedAt: now,
          revokedBy: req.user!.id,
          revocationReason: reason,
        })
        .where(eq(schema.devices.id, id));

      await recordAudit(req.user!.id, "DEVICE_REVOKED", "device", id, {
        reason,
        revokedAt: now.toISOString(),
      });

      return reply.send({
        success: true,
        deviceId: id,
        revokedAt: now.toISOString(),
        reason,
      });
    }
  );
}

