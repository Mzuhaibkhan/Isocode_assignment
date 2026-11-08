import { describe, it, expect, beforeAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { signedSession, loginAs } from "./helpers/sessions.js";
import { eq } from "drizzle-orm";

describe("Session security, RBAC and endpoint auth (§8)", () => {
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

  describe("Session cookie integrity", () => {
    it("rejects a forged unsigned JSON cookie", async () => {
      const forged = JSON.stringify({
        id: "user-office-1",
        role: "office_manager",
        name: "Attacker",
      });

      const res = await app.inject({
        method: "GET",
        url: "/protected/office-only",
        cookies: { session: forged },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects a tampered signed cookie", async () => {
      const signed = signedSession({ id: "user-office-1", role: "office_manager", name: "Anil Kadam" });
      const tampered = signed.slice(0, -4) + "AAAA";

      const res = await app.inject({
        method: "GET",
        url: "/protected/office-only",
        cookies: { session: tampered },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects sessions for users that no longer exist", async () => {
      const ghost = signedSession({ id: "user-ghost", role: "office_manager", name: "Ghost" });

      const res = await app.inject({
        method: "GET",
        url: "/protected/office-only",
        cookies: { session: ghost },
      });
      expect(res.statusCode).toBe(401);
    });

    it("prevents role escalation: operator id cannot claim office_manager", async () => {
      const escalated = signedSession({
        id: "user-op-c07", // real operator id…
        role: "office_manager", // …with a forged office role in the cookie
        name: "Ramesh Patil",
      });

      const res = await app.inject({
        method: "GET",
        url: "/protected/office-only",
        cookies: { session: escalated },
      });
      // Role is re-derived from the database, so the forged role is ignored
      expect(res.statusCode).toBe(403);
    });

    it("accepts a valid end-to-end login session", async () => {
      const session = await loginAs(app, "operator");
      const res = await app.inject({
        method: "GET",
        url: "/protected/operator-only",
        cookies: { session },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user.id).toBe("user-op-c07");
    });
  });

  describe("Endpoint authentication", () => {
    it("GET /members requires auth", async () => {
      const res = await app.inject({ method: "GET", url: "/members" });
      expect(res.statusCode).toBe(401);
    });

    it("operators only see members of their own centre", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/members",
        cookies: { session: operatorSession },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.count).toBeGreaterThan(0);
      for (const m of body.members) {
        // C07 covers Ausa + Shirur Anantpal villages in the seed
        expect(["Ausa", "Shirur Anantpal"]).toContain(m.village);
      }
    });

    it("office sees members across all centres", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/members",
        cookies: { session: officeSession },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.count).toBeGreaterThanOrEqual(25);
    });

    it("POST /devices/register requires an operator session", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/devices/register",
        payload: {
          deviceId: "dev-noauth-01",
          centreId: "centre-c07",
          publicKeyJwk: "{}",
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it("device registration ignores client-supplied centre and uses the session centre", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/devices/register",
        cookies: { session: operatorSession },
        payload: {
          deviceId: "dev-centre-bind-01",
          centreId: "centre-c12", // attacker-supplied other centre
          publicKeyJwk: "{}",
        },
      });
      expect(res.statusCode).toBe(200);

      const [device] = await db
        .select()
        .from(schema.devices)
        .where(eq(schema.devices.id, "dev-centre-bind-01"));
      expect(device.centreId).toBe("centre-c07");
      expect(device.userId).toBe("user-op-c07");
    });

    it("POST /photos/read requires auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/photos/read",
        payload: { kind: "meter", image: "data:image/jpeg;base64,AAAA" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("Operator login response carries centre identity (multi-centre §13.3)", () => {
    it("returns centreCode and next slip number for C07", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { role: "operator", centreId: "centre-c07", pin: "1234" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.centreId).toBe("centre-c07");
      expect(body.user.centreCode).toBe("C07");
      // C07 seed range ends at 24519 → next is 24520
      expect(body.nextSlipNo).toBe(24520);
    });

    it("returns centreCode C12 with its own slip range", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { role: "operator", centreId: "centre-c12", pin: "5678" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.centreCode).toBe("C12");
      // C12 seed range ends at 08876 → next is 08877
      expect(body.nextSlipNo).toBe(8877);
    });
  });

  describe("Device revocation lifecycle (§8, §9.7)", () => {
    it("revoked device cannot re-register itself", async () => {
      await app.inject({
        method: "POST",
        url: "/devices/register",
        cookies: { session: operatorSession },
        payload: { deviceId: "dev-lifecycle-01", centreId: "centre-c07", publicKeyJwk: "{}" },
      });

      const revokeRes = await app.inject({
        method: "POST",
        url: "/devices/dev-lifecycle-01/revoke",
        cookies: { session: officeSession },
        payload: { reason: "Lost in transit" },
      });
      expect(revokeRes.statusCode).toBe(200);

      // The old bug: re-registering silently cleared revokedAt. Now it must refuse.
      const reRegister = await app.inject({
        method: "POST",
        url: "/devices/register",
        cookies: { session: operatorSession },
        payload: { deviceId: "dev-lifecycle-01", centreId: "centre-c07", publicKeyJwk: "{}" },
      });
      expect(reRegister.statusCode).toBe(403);

      const [device] = await db
        .select()
        .from(schema.devices)
        .where(eq(schema.devices.id, "dev-lifecycle-01"));
      expect(device.revokedAt).not.toBeNull();
    });

    it("only the office can re-enable a revoked device", async () => {
      const operatorAttempt = await app.inject({
        method: "POST",
        url: "/devices/dev-lifecycle-01/reenable",
        cookies: { session: operatorSession },
      });
      expect(operatorAttempt.statusCode).toBe(403);

      const officeRes = await app.inject({
        method: "POST",
        url: "/devices/dev-lifecycle-01/reenable",
        cookies: { session: officeSession },
      });
      expect(officeRes.statusCode).toBe(200);

      const [device] = await db
        .select()
        .from(schema.devices)
        .where(eq(schema.devices.id, "dev-lifecycle-01"));
      expect(device.revokedAt).toBeNull();

      // After re-enabling, the device can register again
      const reRegister = await app.inject({
        method: "POST",
        url: "/devices/register",
        cookies: { session: operatorSession },
        payload: { deviceId: "dev-lifecycle-01", centreId: "centre-c07", publicKeyJwk: "{}" },
      });
      expect(reRegister.statusCode).toBe(200);
    });
  });
});
