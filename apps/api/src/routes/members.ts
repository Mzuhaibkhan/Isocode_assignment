import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { encryptBank, decryptBank, maskBankAccount } from "../crypto/aes.js";
import { requireAuth } from "./auth.js";
import { recordAudit } from "../db/audit.js";
import { MemberCreateSchema } from "@procurement/shared";
import { z } from "zod";

const MemberUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  nameLatin: z.string().optional(),
  village: z.string().min(1).optional(),
  landTenthsAcre: z.number().int().min(0).optional(),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Must be valid 10-digit Indian mobile number").optional(),
  bankAccount: z.string().min(8).max(20).optional(),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Must be valid Indian IFSC code").optional(),
});

type MemberRow = typeof schema.members.$inferSelect;

export async function membersRoutes(app: FastifyInstance) {
  // GET /members - List members for local cache or UI
  app.get("/members", async (req: FastifyRequest, reply: FastifyReply) => {
    const { search } = req.query as { search?: string };

    const rows: MemberRow[] = await db
      .select()
      .from(schema.members)
      .orderBy(desc(schema.members.createdAt));

    const formatted = rows
      .filter((m: MemberRow) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          m.farmerCode.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          (m.nameLatin && m.nameLatin.toLowerCase().includes(q)) ||
          m.village.toLowerCase().includes(q)
        );
      })
      .map((m: MemberRow) => {
        let maskedAc = "";
        try {
          const rawAc = decryptBank(m.bankAccountEnc);
          maskedAc = maskBankAccount(rawAc);
        } catch {
          maskedAc = "••••••••";
        }

        return {
          id: m.id,
          farmerCode: m.farmerCode,
          name: m.name,
          nameLatin: m.nameLatin,
          village: m.village,
          landTenthsAcre: m.landTenthsAcre,
          mobile: m.mobile,
          bankAccountMasked: maskedAc,
          ifsc: m.ifsc,
          bankVerified: !!m.bankVerifiedAt,
          bankVerifiedAt: m.bankVerifiedAt,
          consentAt: m.consentAt,
          consentTextVersion: m.consentTextVersion,
          consentWithdrawn: !!m.consentWithdrawnAt,
          consentWithdrawnAt: m.consentWithdrawnAt,
          createdAt: m.createdAt,
        };
      });

    return reply.send({ members: formatted, count: formatted.length });
  });

  // POST /members - Register new member (Office Manager only)
  app.post(
    "/members",
    { preHandler: requireAuth(["office_manager"]) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = MemberCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      const input = parsed.data;

      // Check unique farmer code
      const [existing] = await db
        .select()
        .from(schema.members)
        .where(eq(schema.members.farmerCode, input.farmerCode))
        .limit(1);

      if (existing) {
        return reply.status(409).send({ error: "Farmer code already exists" });
      }

      const id = `member-${Date.now()}`;
      const bankAccountEnc = encryptBank(input.bankAccount);

      await db.insert(schema.members).values({
        id,
        farmerCode: input.farmerCode,
        name: input.name,
        nameLatin: input.nameLatin || null,
        village: input.village,
        landTenthsAcre: input.landTenthsAcre,
        mobile: input.mobile,
        bankAccountEnc,
        ifsc: input.ifsc,
        bankVerifiedAt: null, // Starts unverified
        consentAt: new Date(input.consentAt),
        consentTextVersion: input.consentTextVersion,
      });

      await recordAudit(
        req.user!.id,
        "MEMBER_REGISTERED",
        "member",
        id,
        { farmerCode: input.farmerCode, name: input.name }
      );

      return reply.status(201).send({
        success: true,
        member: {
          id,
          farmerCode: input.farmerCode,
          name: input.name,
          nameLatin: input.nameLatin,
          village: input.village,
          mobile: input.mobile,
          bankAccountMasked: maskBankAccount(input.bankAccount),
          ifsc: input.ifsc,
          bankVerified: false,
          consentWithdrawn: false,
        },
      });
    }
  );

  // PATCH /members/:id - Update member details (Office Manager only)
  app.patch<{ Params: { id: string } }>(
    "/members/:id",
    { preHandler: requireAuth(["office_manager"]) },
    async (req, reply) => {
      const { id } = req.params;
      const parsed = MemberUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      const [member] = await db
        .select()
        .from(schema.members)
        .where(eq(schema.members.id, id))
        .limit(1);

      if (!member) {
        return reply.status(404).send({ error: "Member not found" });
      }

      const updates: Partial<typeof schema.members.$inferInsert> = {};
      const input = parsed.data;

      if (input.name !== undefined) updates.name = input.name;
      if (input.nameLatin !== undefined) updates.nameLatin = input.nameLatin;
      if (input.village !== undefined) updates.village = input.village;
      if (input.landTenthsAcre !== undefined) updates.landTenthsAcre = input.landTenthsAcre;
      if (input.mobile !== undefined) updates.mobile = input.mobile;
      if (input.ifsc !== undefined) updates.ifsc = input.ifsc;
      if (input.bankAccount !== undefined) {
        updates.bankAccountEnc = encryptBank(input.bankAccount);
        updates.bankVerifiedAt = null;
      }

      await db.update(schema.members).set(updates).where(eq(schema.members.id, id));

      await recordAudit(req.user!.id, "MEMBER_UPDATED", "member", id, updates);

      return reply.send({ success: true, updated: updates });
    }
  );

  // POST /members/:id/verify-bank - Confirm bank account verification (Office Manager only)
  app.post<{ Params: { id: string } }>(
    "/members/:id/verify-bank",
    { preHandler: requireAuth(["office_manager"]) },
    async (req, reply) => {
      const { id } = req.params;

      const [member] = await db
        .select()
        .from(schema.members)
        .where(eq(schema.members.id, id))
        .limit(1);

      if (!member) {
        return reply.status(404).send({ error: "Member not found" });
      }

      const now = new Date();
      await db
        .update(schema.members)
        .set({ bankVerifiedAt: now })
        .where(eq(schema.members.id, id));

      await recordAudit(req.user!.id, "BANK_VERIFIED", "member", id, {
        verifiedAt: now.toISOString(),
      });

      return reply.send({ success: true, verifiedAt: now });
    }
  );

  // POST /members/:id/withdraw-consent - Record consent withdrawal (DPDP Act §6)
  app.post<{ Params: { id: string } }>(
    "/members/:id/withdraw-consent",
    { preHandler: requireAuth(["office_manager"]) },
    async (req, reply) => {
      const { id } = req.params;

      const [member] = await db
        .select()
        .from(schema.members)
        .where(eq(schema.members.id, id))
        .limit(1);

      if (!member) {
        return reply.status(404).send({ error: "Member not found" });
      }

      const now = new Date();
      await db
        .update(schema.members)
        .set({ consentWithdrawnAt: now })
        .where(eq(schema.members.id, id));

      await recordAudit(req.user!.id, "CONSENT_WITHDRAWN", "member", id, {
        withdrawnAt: now.toISOString(),
      });

      return reply.send({
        success: true,
        consentWithdrawnAt: now,
        message: "Consent withdrawal recorded. Member blocked from future purchases; prior deliveries remain payable.",
      });
    }
  );
}
