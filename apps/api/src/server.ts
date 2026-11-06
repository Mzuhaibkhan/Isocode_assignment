import Fastify, { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { authRoutes, requireAuth } from "./routes/auth.js";
import { membersRoutes } from "./routes/members.js";
import { pricesRoutes } from "./routes/prices.js";
import { purchasesRoutes } from "./routes/purchases.js";
import { smsRoutes } from "./routes/sms.js";
import { devicesRoutes } from "./routes/devices.js";
import { syncRoutes } from "./routes/sync.js";
import { netWeightX10, amountPaise, formatRupees } from "@procurement/shared";

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: false,
  });

  // Security plugins
  app.register(helmet, {
    contentSecurityPolicy: false,
  });

  app.register(cors, {
    origin: true,
    credentials: true,
  });

  app.register(cookie, {
    secret: config.SESSION_SECRET,
  });

  app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  // Health route
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // Register routes
  app.register(authRoutes);
  app.register(membersRoutes);
  app.register(pricesRoutes);
  app.register(purchasesRoutes);
  app.register(smsRoutes);
  app.register(devicesRoutes);
  app.register(syncRoutes);

  // Role guarded test endpoints for verification
  app.get(
    "/protected/office-only",
    { preHandler: requireAuth(["office_manager"]) },
    async (req) => {
      return { message: "Welcome office manager", user: req.user };
    }
  );

  app.get(
    "/protected/operator-only",
    { preHandler: requireAuth(["operator"]) },
    async (req) => {
      return { message: "Welcome operator", user: req.user };
    }
  );

  // Server recomputation endpoint: proves the server never trusts phone calculations
  app.post("/purchases/recompute", async (req, reply) => {
    const body = req.body as {
      grossX10: number;
      tareX10: number;
      moistureX10: number;
      ratePaise: number;
      claimedNetX10?: number;
      claimedAmountPaise?: number;
    };

    try {
      const net = netWeightX10(body.grossX10, body.tareX10, body.moistureX10);
      const amount = amountPaise(net, body.ratePaise);

      const netMatches = body.claimedNetX10 === undefined || body.claimedNetX10 === net;
      const amountMatches = body.claimedAmountPaise === undefined || body.claimedAmountPaise === amount;

      if (!netMatches || !amountMatches) {
        return reply.status(400).send({
          valid: false,
          reason: "CALCULATION_MISMATCH",
          recomputed: { netX10: net, amountPaise: amount, formatted: formatRupees(amount) },
        });
      }

      return reply.send({
        valid: true,
        recomputed: { netX10: net, amountPaise: amount, formatted: formatRupees(amount) },
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  return app;
}
