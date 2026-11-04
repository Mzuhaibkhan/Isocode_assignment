import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { verifySecret } from "../auth/hash.js";
import { LoginSchema, LoginInput } from "@procurement/shared";

export interface SessionUser {
  id: string;
  role: "operator" | "office_manager";
  name: string;
  centreId?: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
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

      reply.setCookie("session", JSON.stringify(sessionData), {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });

      return reply.send({ success: true, user: sessionData });
    }

    if (input.role === "operator") {
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.centreId, input.centreId))
        .limit(1);

      if (!user || user.role !== "operator" || !user.pinHash) {
        return reply.status(401).send({ error: "Invalid centre or PIN" });
      }

      const isValid = await verifySecret(input.pin, user.pinHash);
      if (!isValid) {
        return reply.status(401).send({ error: "Invalid centre or PIN" });
      }

      const sessionData: SessionUser = {
        id: user.id,
        role: "operator",
        name: user.name,
        centreId: user.centreId,
      };

      reply.setCookie("session", JSON.stringify(sessionData), {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });

      return reply.send({ success: true, user: sessionData });
    }
  });

  app.post("/auth/logout", async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie("session", { path: "/" });
    return reply.send({ success: true });
  });

  app.get("/auth/me", async (req: FastifyRequest, reply: FastifyReply) => {
    const sessionCookie = req.cookies.session;
    if (!sessionCookie) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    try {
      const user = JSON.parse(sessionCookie) as SessionUser;
      return reply.send({ user });
    } catch {
      return reply.status(401).send({ error: "Invalid session" });
    }
  });
}

// Role guard middleware
export function requireAuth(roles?: ("operator" | "office_manager")[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const sessionCookie = req.cookies.session;
    if (!sessionCookie) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    try {
      const user = JSON.parse(sessionCookie) as SessionUser;
      req.user = user;

      if (roles && !roles.includes(user.role)) {
        return reply.status(403).send({ error: "Forbidden: insufficient permissions" });
      }
    } catch {
      return reply.status(401).send({ error: "Invalid session cookie" });
    }
  };
}

