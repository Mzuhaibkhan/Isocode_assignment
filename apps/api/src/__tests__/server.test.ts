import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../server.js";
import { FastifyInstance } from "fastify";
import { parseConfig, EnvSchema } from "../config.js";
import { encryptBank, decryptBank, maskBankAccount } from "../crypto/aes.js";
import { hashSecret, verifySecret } from "../auth/hash.js";

describe("API Core & Foundations (§Phase 1)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Config Environment Validation (§5)", () => {
    it("fails fast on missing required variables", () => {
      expect(() =>
        parseConfig({
          DATABASE_URL: "invalid-url",
        })
      ).toThrow("[FATAL] Invalid environment configuration");
    });

    it("fails fast if BANK_AES_KEY is not 64 hex chars (32 bytes)", () => {
      expect(() =>
        EnvSchema.parse({
          DATABASE_URL: "postgres://localhost:5432/db",
          VISION_API_KEY: "key",
          BANK_AES_KEY: "tooshort",
          SESSION_SECRET: "12345678901234567890123456789012",
        })
      ).toThrow();
    });

    it("fails fast if SESSION_SECRET is shorter than 32 chars", () => {
      expect(() =>
        EnvSchema.parse({
          DATABASE_URL: "postgres://localhost:5432/db",
          VISION_API_KEY: "key",
          BANK_AES_KEY: "0".repeat(64),
          SESSION_SECRET: "short_secret",
        })
      ).toThrow();
    });
  });

  describe("Bank AES Encryption & Masking (§7, §16)", () => {
    it("encrypts and decrypts bank account reliably", () => {
      const original = "912345678901";
      const encrypted = encryptBank(original);
      expect(encrypted).not.toBe(original);
      expect(encrypted).toContain(":"); // iv:tag:ciphertext

      const decrypted = decryptBank(encrypted);
      expect(decrypted).toBe(original);
    });

    it("masks bank account displaying only last 4 digits", () => {
      expect(maskBankAccount("912345678901")).toBe("••••••••8901");
      expect(maskBankAccount("1234")).toBe("1234");
    });
  });

  describe("Argon2 Hash & Verify (§3, §14)", () => {
    it("hashes and verifies passwords and PINs", async () => {
      const password = "Password123!";
      const hashed = await hashSecret(password);
      expect(await verifySecret(password, hashed)).toBe(true);
      expect(await verifySecret("WrongPass!", hashed)).toBe(false);

      const pin = "1234";
      const pinHashed = await hashSecret(pin);
      expect(await verifySecret(pin, pinHashed)).toBe(true);
      expect(await verifySecret("9999", pinHashed)).toBe(false);
    });
  });

  describe("Server Recomputation (§4, §6)", () => {
    it("validates and accepts correct calculation for slip C07-24518", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/purchases/recompute",
        payload: {
          grossX10: 12500,
          tareX10: 180,
          moistureX10: 115,
          ratePaise: 485000,
          claimedNetX10: 12320,
          claimedAmountPaise: 5975200,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.valid).toBe(true);
      expect(data.recomputed.formatted).toBe("₹59,752.00");
    });

    it("rejects phone calculation when net or amount is tampered", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/purchases/recompute",
        payload: {
          grossX10: 12500,
          tareX10: 180,
          moistureX10: 115,
          ratePaise: 485000,
          claimedNetX10: 12400, // tampered!
          claimedAmountPaise: 6000000, // tampered!
        },
      });

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.payload);
      expect(data.valid).toBe(false);
      expect(data.reason).toBe("CALCULATION_MISMATCH");
      expect(data.recomputed.netX10).toBe(12320);
      expect(data.recomputed.amountPaise).toBe(5975200);
    });
  });

  describe("Role Route Guards (§8, §14)", () => {
    it("rejects unauthenticated requests to protected routes", async () => {
      const resOffice = await app.inject({
        method: "GET",
        url: "/protected/office-only",
      });
      expect(resOffice.statusCode).toBe(401);

      const resOp = await app.inject({
        method: "GET",
        url: "/protected/operator-only",
      });
      expect(resOp.statusCode).toBe(401);
    });

    it("enforces role permissions when session cookie is provided", async () => {
      // Mock operator session
      const opCookie = JSON.stringify({
        id: "user-op-1",
        role: "operator",
        name: "Test Operator",
      });

      const resOfficeWithOp = await app.inject({
        method: "GET",
        url: "/protected/office-only",
        cookies: { session: opCookie },
      });
      expect(resOfficeWithOp.statusCode).toBe(403); // Forbidden!

      const resOpWithOp = await app.inject({
        method: "GET",
        url: "/protected/operator-only",
        cookies: { session: opCookie },
      });
      expect(resOpWithOp.statusCode).toBe(200);
    });
  });
});

