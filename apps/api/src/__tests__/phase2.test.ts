import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../server.js";
import { FastifyInstance } from "fastify";
import { signedSession } from "./helpers/sessions.js";

describe("Phase 2: Member Registry & Price Board Integration Tests", () => {
  let app: FastifyInstance;

  const officeSession = signedSession({
    id: "user-office-1",
    role: "office_manager",
    name: "Anil Kadam",
  });

  const operatorSession = signedSession({
    id: "user-op-c07",
    role: "operator",
    name: "Ramesh Patil",
    centreId: "centre-c07",
  });

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Member Management (§8, §13.2)", () => {
    it("lists members with masked bank account and consent status", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/members",
        cookies: { session: officeSession },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(Array.isArray(data.members)).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(25);

      const fmr1 = data.members.find((m: any) => m.farmerCode === "FMR-001");
      expect(fmr1).toBeDefined();
      expect(fmr1.name).toBe("सुनील जाधव");
      expect(fmr1.bankAccountMasked).toBe("••••••••8901");
      expect(fmr1.bankVerified).toBe(true);
      expect(fmr1.consentWithdrawn).toBe(false);
    });

    it("allows office manager to register a new member with Marathi consent", async () => {
      const newFarmerCode = `FMR-TEST-${Date.now().toString().slice(-4)}`;
      const res = await app.inject({
        method: "POST",
        url: "/members",
        cookies: { session: officeSession },
        payload: {
          farmerCode: newFarmerCode,
          name: "ज्ञानेश्वर पाटील",
          nameLatin: "Dnyaneshwar Patil",
          village: "Ausa",
          landTenthsAcre: 40,
          mobile: "9822998877",
          bankAccount: "112233445566",
          ifsc: "MAHB0000123",
          consentAt: new Date().toISOString(),
          consentTextVersion: 1,
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.success).toBe(true);
      expect(data.member.farmerCode).toBe(newFarmerCode);
      expect(data.member.bankAccountMasked).toBe("••••••••5566");
      expect(data.member.bankVerified).toBe(false);
    });

    it("rejects invalid mobile numbers or invalid IFSC formats", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/members",
        cookies: { session: officeSession },
        payload: {
          farmerCode: "FMR-INVALID",
          name: "Test Farmer",
          village: "Ausa",
          landTenthsAcre: 10,
          mobile: "12345", // invalid mobile
          bankAccount: "12345678",
          ifsc: "INVALID_IFSC", // invalid IFSC
          consentAt: new Date().toISOString(),
          consentTextVersion: 1,
        },
      });

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.payload);
      expect(data.error).toBe("Validation failed");
    });

    it("blocks operators from registering new members", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/members",
        cookies: { session: operatorSession },
        payload: {
          farmerCode: "FMR-OP-BLOCKED",
          name: "Blocked Farmer",
          village: "Ausa",
          landTenthsAcre: 10,
          mobile: "9822000000",
          bankAccount: "12345678",
          ifsc: "MAHB0000123",
          consentAt: new Date().toISOString(),
          consentTextVersion: 1,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("allows office manager to verify bank account details", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/members/member-1/verify-bank",
        cookies: { session: officeSession },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.success).toBe(true);
      expect(data.verifiedAt).toBeDefined();
    });

    it("allows office manager to record consent withdrawal (DPDP Act §6)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/members/member-4/withdraw-consent",
        cookies: { session: officeSession },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.success).toBe(true);
      expect(data.consentWithdrawnAt).toBeDefined();

      // Verify that member now returns consentWithdrawn: true in list
      const listRes = await app.inject({
        method: "GET",
        url: "/members",
        cookies: { session: officeSession },
      });
      const listData = JSON.parse(listRes.payload);
      const member4 = listData.members.find((m: any) => m.id === "member-4");
      expect(member4.consentWithdrawn).toBe(true);
    });
  });

  describe("Daily Price Board Management (§8, §13.2)", () => {
    it("fetches current active prices with version and formatting", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/prices/current",
        cookies: { session: operatorSession },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(Array.isArray(data.prices)).toBe(true);
      expect(data.prices.length).toBeGreaterThanOrEqual(2);

      const soybean = data.prices.find((p: any) => p.crop === "Soybean");
      expect(soybean).toBeDefined();
      expect(soybean.rateRupees).toBe(4850);
      expect(soybean.rateFormatted).toBe("₹4,850.00");
    });

    it("allows office manager to publish a new price with version increment", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/prices",
        cookies: { session: officeSession },
        payload: {
          crop: "Soybean",
          grade: "FAQ",
          ratePaisePerQuintal: 495000, // Rs 4,950
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.success).toBe(true);
      expect(data.price.rateRupees).toBe(4950);
      expect(data.price.rateFormatted).toBe("₹4,950.00");
      expect(data.price.version).toBeGreaterThanOrEqual(2);

      // Verify that current price endpoint now reflects this new version
      const currentRes = await app.inject({
        method: "GET",
        url: "/prices/current",
        cookies: { session: officeSession },
      });
      const currentData = JSON.parse(currentRes.payload);
      const updatedSoybean = currentData.prices.find((p: any) => p.crop === "Soybean");
      expect(updatedSoybean.rateRupees).toBe(4950);
      expect(updatedSoybean.version).toBe(data.price.version);
    });

    it("maintains historical audit trail of all published prices", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/prices/history",
        cookies: { session: officeSession },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.history.length).toBeGreaterThanOrEqual(3);
    });

    it("blocks operators from publishing prices", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/prices",
        cookies: { session: operatorSession },
        payload: {
          crop: "Soybean",
          grade: "FAQ",
          ratePaisePerQuintal: 510000,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("rejects unauthenticated price board reads", async () => {
      const currentRes = await app.inject({ method: "GET", url: "/prices/current" });
      expect(currentRes.statusCode).toBe(401);

      const historyRes = await app.inject({ method: "GET", url: "/prices/history" });
      expect(historyRes.statusCode).toBe(401);
    });
  });
});

