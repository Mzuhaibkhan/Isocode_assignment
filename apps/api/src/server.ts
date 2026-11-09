import Fastify, { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import { authRoutes, requireAuth } from "./routes/auth.js";
import { membersRoutes } from "./routes/members.js";
import { pricesRoutes } from "./routes/prices.js";
import { purchasesRoutes } from "./routes/purchases.js";
import { smsRoutes } from "./routes/sms.js";
import { devicesRoutes } from "./routes/devices.js";
import { syncRoutes } from "./routes/sync.js";
import { photosRoutes } from "./routes/photos.js";
import { reviewRoutes } from "./routes/review.js";
import { paymentsRoutes } from "./routes/payments.js";
import { centresRoutes } from "./routes/centres.js";
import { netWeightX10, amountPaise, formatRupees } from "@procurement/shared";

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: false,
  });

  // Security plugins
  app.register(helmet, {
    contentSecurityPolicy: false,
  });

  // CORS restricted to the configured web origin(s) (comma-separated in WEB_ORIGIN)
  const allowedOrigins = config.WEB_ORIGIN.split(",").map((o) => o.trim());
  app.register(cors, {
    origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
      // Non-browser clients (curl, tests, the PWA fetch layer on device) send no Origin
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error(`Origin ${origin} not allowed by CORS`), false);
      }
    },
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

  // Register routes at the root AND under /api. The PWA calls /api/* in
  // production (same-origin static serving); dev relies on the Vite proxy
  // stripping /api, so both mounts keep every environment working.
  const registerRoutes = async (a: FastifyInstance) => {
    a.register(authRoutes);
    a.register(membersRoutes);
    a.register(pricesRoutes);
    a.register(purchasesRoutes);
    a.register(smsRoutes);
    a.register(devicesRoutes);
    a.register(syncRoutes);
    a.register(photosRoutes);
    a.register(reviewRoutes);
    a.register(paymentsRoutes);
    a.register(centresRoutes);
  };
  app.register(registerRoutes);
  app.register(registerRoutes, { prefix: "/api" });

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

  // Production single-origin deployment: serve the built PWA (apps/web/dist)
  // from the same Fastify instance so relative /api/* calls and the offline
  // service worker work without a separate static host or CORS/proxy config.
  const webDist = path.resolve(process.cwd(), "../web/dist");
  if (process.env.NODE_ENV === "production" && fs.existsSync(webDist)) {
    app.register(fastifyStatic, { root: webDist, prefix: "/" });
    app.setNotFoundHandler((req, reply) => {
      // SPA fallback: unknown GET navigation requests return index.html
      if (req.raw.method === "GET" && req.raw.headers.accept?.includes("text/html")) {
        return reply.sendFile("index.html");
      }
      return reply.status(404).send({ error: "NOT_FOUND" });
    });
  }

  return app;
}
