import { describe, it, expect, beforeAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { runSeed } from "../db/seed.js";
import { decryptBank } from "../crypto/aes.js";
import { eq } from "drizzle-orm";

describe("Phase 3: Purchases API & Marathi SMS (§11)", () => {
  let app: FastifyInstance;

  const operatorSession = JSON.stringify({
    id: "user-op-c07",
    role: "operator",
    name: "Ramesh Patil",
    centreId: "centre-c07",
  });

  const officeSession = JSON.stringify({
    id: "user-office-1",
    role: "office_manager",
    name: "Anil Kadam",
  });

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
    await runSeed(db);
  });

  it("creates Sunil Jadhav purchase with exact §11 formula and sends SMS", async () => {
    // Member-1: Sunil Jadhav
    const res = await app.inject({
      method: "POST",
      url: "/purchases",
      cookies: { session: operatorSession },
      payload: {
        memberId: "member-1",
        crop: "Soybean",
        grade: "FAQ",
        grossX10: 12500, // 1250.0 kg
        tareX10: 180,    // 18.0 kg
        moistureX10: 115,// 11.5 % (under 12% baseline -> 0 deduction)
        claimedNetX10: 12320,
        claimedAmountPaise: 5975200, // ₹59,752.00
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.purchase.netX10).toBe(12320);
    expect(body.purchase.amountPaise).toBe(5975200);

    // Marathi slip verification
    expect(body.slip.farmerName).toBe("सुनील जाधव");
    expect(body.slip.crop).toBe("सोयाबीन");
    expect(body.slip.netKg).toBe("1232.0");
    expect(body.slip.moisturePercent).toBe("11.5");
    expect(body.slip.ratePerQuintal).toBe(4850);
    expect(body.slip.amountFormatted).toBe("₹59,752.00");
    expect(body.slip.smsStatus).toBe("sent");

    // Marathi SMS text verification matching §11
    expect(body.slip.smsBody).toContain("पावती ");
    expect(body.slip.smsBody).toContain("सुनील जाधव | सोयाबीन");
    expect(body.slip.smsBody).toContain("निव्वळ वजन: 1232.0 किग्रॅ");
    expect(body.slip.smsBody).toContain("ओलावा: 11.5%");
    expect(body.slip.smsBody).toContain("दर: ₹4,850 प्रति क्विंटल");
    expect(body.slip.smsBody).toContain("रक्कम: ₹59,752.00");
    expect(body.slip.smsBody).toContain("48 तासांत पैसे जमा होतील");
  });

  it("creates Kamal Shinde purchase with moisture deduction (14% -> 2% deduction)", async () => {
    // 860.0 - 12.0 = 848.0 kg. Moisture 14% -> 2% deduction (16.96 kg) -> net 831.0 kg
    const res = await app.inject({
      method: "POST",
      url: "/purchases",
      cookies: { session: operatorSession },
      payload: {
        memberId: "member-2",
        crop: "Soybean",
        grade: "FAQ",
        grossX10: 8600,
        tareX10: 120,
        moistureX10: 140, // 14.0%
        claimedNetX10: 8310,
        claimedAmountPaise: 4030350, // ₹40,303.50
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.purchase.netX10).toBe(8310);
    expect(body.purchase.amountPaise).toBe(4030350);
    expect(body.slip.amountFormatted).toBe("₹40,303.50");
  });

  it("creates Mohan Biradar Tur purchase (640.0 - 10.0 = 630.0 kg @ ₹7,200)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/purchases",
      cookies: { session: operatorSession },
      payload: {
        memberId: "member-3",
        crop: "Tur",
        grade: "FAQ",
        grossX10: 6400,
        tareX10: 100,
        moistureX10: 100, // 10.0% (<= 12%, no deduction)
        claimedNetX10: 6300,
        claimedAmountPaise: 4536000, // ₹45,360.00
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.purchase.netX10).toBe(6300);
    expect(body.purchase.amountPaise).toBe(4536000);
    expect(body.slip.amountFormatted).toBe("₹45,360.00");
  });

  it("rejects purchase with CALCULATION_MISMATCH when claimed values are tampered", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/purchases",
      cookies: { session: operatorSession },
      payload: {
        memberId: "member-1",
        crop: "Soybean",
        grade: "FAQ",
        grossX10: 12500,
        tareX10: 180,
        moistureX10: 115,
        claimedNetX10: 12500, // Tampered! Expected 12320
        claimedAmountPaise: 6062500, // Tampered!
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("CALCULATION_MISMATCH");
    expect(body.recomputed.netX10).toBe(12320);
    expect(body.recomputed.amountPaise).toBe(5975200);
  });

  it("rejects purchase when tare weight exceeds gross weight", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/purchases",
      cookies: { session: operatorSession },
      payload: {
        memberId: "member-1",
        crop: "Soybean",
        grade: "FAQ",
        grossX10: 1000,
        tareX10: 1200, // Tare > Gross
        moistureX10: 110,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain("Tare weight cannot exceed gross weight");
  });

  it("blocks purchase if member has withdrawn DPDP Act 2023 consent", async () => {
    // Withdraw consent for member-4 (Requires office_manager role)
    const withdrawRes = await app.inject({
      method: "POST",
      url: "/members/member-4/withdraw-consent",
      cookies: { session: officeSession },
    });
    expect(withdrawRes.statusCode).toBe(200);

    // Attempt purchase for member-4
    const res = await app.inject({
      method: "POST",
      url: "/purchases",
      cookies: { session: operatorSession },
      payload: {
        memberId: "member-4",
        crop: "Soybean",
        grade: "FAQ",
        grossX10: 10000,
        tareX10: 100,
        moistureX10: 110,
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("CONSENT_WITHDRAWN");
    expect(body.message).toContain("DPDP");
  });

  it("captures member snapshot encrypted with AES-256-GCM on accepted purchase", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/purchases",
      cookies: { session: operatorSession },
      payload: {
        memberId: "member-1",
        crop: "Soybean",
        grade: "FAQ",
        grossX10: 12500,
        tareX10: 180,
        moistureX10: 115,
      },
    });

    const body = JSON.parse(res.payload);
    const purchaseId = body.purchase.id;

    // Check DB record directly
    const [dbRecord] = await db
      .select()
      .from(schema.purchases)
      .where(eq(schema.purchases.id, purchaseId));

    expect(dbRecord.memberSnapshotJson).toBeDefined();
    // Verify ciphertext format: iv:authTag:ciphertext
    expect(dbRecord.memberSnapshotJson.split(":").length).toBe(3);

    // Decrypt snapshot and verify contents
    const decrypted = JSON.parse(decryptBank(dbRecord.memberSnapshotJson));
    expect(decrypted.name).toBe("सुनील जाधव");
    expect(decrypted.bankAccountMasked).toMatch(/•{8}\d{4}/);
    expect(decrypted.ifsc).toBe("MAHB0000123");
  });

  it("records SMS to sms_log with masked mobile and provides GET /sms-log", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/sms-log",
      cookies: { session: operatorSession },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.messages.length).toBeGreaterThan(0);

    const firstMsg = body.messages[0];
    expect(firstMsg.toMobileMasked).toMatch(/^\d{4}\*{4}\d{2}$/);
    expect(firstMsg.body).toContain("48 तासांत पैसे जमा होतील");
    expect(firstMsg.status).toBe("sent");
  });

  it("records audit log entry for PURCHASE_CREATED", async () => {
    const auditLogs = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "PURCHASE_CREATED"));

    expect(auditLogs.length).toBeGreaterThan(0);
    const lastAudit = auditLogs[auditLogs.length - 1];
    expect(lastAudit.entity).toBe("purchase");
    expect(lastAudit.metaJson).toContain("slipNo");
  });

  it("retrieves purchase list and purchase detail with GET /purchases", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: "/purchases",
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.payload);
    expect(listBody.purchases.length).toBeGreaterThan(0);

    const samplePurchaseId = listBody.purchases[0].id;
    const detailRes = await app.inject({
      method: "GET",
      url: `/purchases/${samplePurchaseId}`,
    });
    expect(detailRes.statusCode).toBe(200);
    const detailBody = JSON.parse(detailRes.payload);
    expect(detailBody.purchase.id).toBe(samplePurchaseId);
    expect(detailBody.purchase.memberSnapshot).toBeDefined();
    expect(detailBody.smsLogs).toBeDefined();
  });
});
