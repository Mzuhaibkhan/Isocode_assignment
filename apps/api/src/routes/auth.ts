import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, like } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { verifySecret } from "../auth/hash.js";
import { LoginSchema } from "@procurement/shared";

export interface SessionUser {
  id: string;
  role: "operator" | "office_manager";
  name: string;
  centreId?: string | null;
  centreCode?: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

function sessionCookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    signed: true,
  };
}

// Next slip number for a centre: max numeric suffix of its slips + 1.
// The office-seeded C07 range ends at 24519, so the first new slip is C07-24520.
async function nextSlipNoForCentre(centreCode: string): Promise<number> {
  const rows = await db
    .select({ slipNo: schema.purchases.slipNo })
    .from(schema.purchases)
    .where(like(schema.purchases.slipNo, `${centreCode}-%`));

  let maxSuffix = 0;
  for (const row of rows) {
    const suffix = parseInt(row.slipNo.split("-").pop() ?? "0", 10);
    if (!Number.isNaN(suffix) && suffix > maxSuffix) maxSuffix = suffix;
  }
  return maxSuffix + 1;
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const input = parseResult.data;

    if (input.role === "office_manager") {
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, input.email))
        .limit(1);

      if (!user || user.role !== "office_manager" || !user.passwordHash) {
        return reply.status(401).send({ error: "Invalid email or password" });
      }

      const isValid = await verifySecret(input.password, user.passwordHash);
      if (!isValid) {
        return reply.status(401).send({ error: "Invalid email or password" });
      }

      const sessionData: SessionUser = {
        id: user.id,
        role: "office_manager",
        name: user.name,
      };

      reply.setCookie("session", JSON.stringify(sessionData), sessionCookieOptions());

      return reply.send({ success: true, user: sessionData });
    }

    if (input.role === "operator") {
      const [row] = await db
        .select({
          id: schema.users.id,
          role: schema.users.role,
          name: schema.users.name,
          centreId: schema.users.centreId,
          centreCode: schema.centres.code,
          pinHash: schema.users.pinHash,
        })
        .from(schema.users)
        .leftJoin(schema.centres, eq(schema.users.centreId, schema.centres.id))
        .where(eq(schema.users.centreId, input.centreId))
        .limit(1);

      if (!row || row.role !== "operator" || !row.pinHash) {
        return reply.status(401).send({ error: "Invalid centre or PIN" });
      }

      const isValid = await verifySecret(input.pin, row.pinHash);
      if (!isValid) {
        return reply.status(401).send({ error: "Invalid centre or PIN" });
      }

      const sessionData: SessionUser = {
        id: row.id,
        role: "operator",
        name: row.name,
        centreId: row.centreId,
        centreCode: row.centreCode,
      };

      reply.setCookie("session", JSON.stringify(sessionData), sessionCookieOptions());

      // Seed the phone's per-centre slip counter so slips continue from the
      // highest number already issued to this centre (no cross-centre collisions).
      const nextSlipNo = await nextSlipNoForCentre(row.centreCode ?? "C00");

      return reply.send({
        success: true,
        user: sessionData,
        nextSlipNo,
      });
    }
  });

  app.post("/auth/logout", async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie("session", { path: "/" });
    return reply.send({ success: true });
  });

  app.get(
    "/auth/me",
    { preHandler: requireAuth() },
    async (req: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ user: req.user });
    }
  );
}

// Role guard middleware.
// The session cookie is HMAC-signed by @fastify/cookie; after signature
// verification only the user id is read from it, and the role / centre are
// re-derived from the database so a forged or stale cookie cannot escalate.
export function requireAuth(roles?: ("operator" | "office_manager")[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const sessionCookie = req.cookies.session;
    if (!sessionCookie) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const unsignResult = req.unsignCookie(sessionCookie);
    if (!unsignResult.valid || !unsignResult.value) {
      return reply.status(401).send({ error: "Invalid session signature" });
    }

    let sessionId = "";
    try {
      const session = JSON.parse(unsignResult.value) as { id?: string };
      if (!session.id) throw new Error("missing id");
      sessionId = session.id;
    } catch {
      return reply.status(401).send({ error: "Invalid session cookie" });
    }

    const [userRow] = await db
      .select({
        id: schema.users.id,
        role: schema.users.role,
        name: schema.users.name,
        centreId: schema.users.centreId,
        centreCode: schema.centres.code,
      })
      .from(schema.users)
      .leftJoin(schema.centres, eq(schema.users.centreId, schema.centres.id))
      .where(eq(schema.users.id, sessionId))
      .limit(1);

    if (!userRow) {
      return reply.status(401).send({ error: "Session user no longer exists" });
    }

    const user: SessionUser = {
      id: userRow.id,
      role: userRow.role as "operator" | "office_manager",
      name: userRow.name,
      centreId: userRow.centreId,
      centreCode: userRow.centreCode,
    };
    req.user = user;

    if (roles && !roles.includes(user.role)) {
      return reply.status(403).send({ error: "Forbidden: insufficient permissions" });
    }
  };
}
