import { describe, it, expect, beforeAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { signedSession } from "./helpers/sessions.js";

describe("Purchases API hardening (legacy path removed)", () => {
  let app: FastifyInstance;

  const operatorSession = signedSession({
    id: "user-op-c07",
    role: "operator",
    name: "Ramesh Patil",
    centreId: "centre-c07",
  });

  const officeSession = signedSession({
    id: "user-office-1",
    role: "office_manager",
    name: "Anil Kadam",
  });

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  it("no longer exposes the unauthenticated POST /purchases legacy path", async () => {
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
        claimedNetX10: 12320,
        claimedAmountPaise: 5975200,
      },
    });

    // Route is gone entirely: all purchase creation flows through /sync/purchases
    expect(res.statusCode).toBe(404);
  });

  it("rejects unauthenticated GET /purchases", async () => {
    const res = await app.inject({ method: "GET", url: "/purchases" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects unauthenticated GET /purchases/:id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/purchases/a0000000-0000-0000-0000-000000000001",
    });
    expect(res.statusCode).toBe(401);
  });

  it("lists purchases for an authenticated office user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/purchases",
      cookies: { session: officeSession },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.purchases.length).toBeGreaterThan(0);
    expect(body.purchases[0].amountFormatted).toBeDefined();
  });

  it("returns purchase detail without exposing the decrypted member snapshot", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/purchases/a0000000-0000-0000-0000-000000000001",
      cookies: { session: officeSession },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.purchase.id).toBe("a0000000-0000-0000-0000-000000000001");
    // The encrypted snapshot stays on the server (§7 DPDP Act 2023)
    expect(body.purchase.memberSnapshot).toBeUndefined();
    expect(body.purchase.memberSnapshotEncrypted).toBe(true);
    expect(body.member.name).toBe("सुनील जाधव");
    expect(Array.isArray(body.smsLogs)).toBe(true);
  });
});
