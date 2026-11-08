import { describe, it, expect, beforeAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { runSeed } from "../db/seed.js";
import { signedSession } from "./helpers/sessions.js";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Phase E: honest payment semantics + immutable stored files (§12).
 * - Purchases enter 'in_payment' at run creation, 'paid' only after the bank
 *   confirms success, and 'approved' again after a failed item (re-eligible).
 * - The generated CSV is stored verbatim at creation and downloads serve the
 *   exact stored bytes.
 * - Cross-run item status updates are rejected.
 * - Purchases whose snapshot cannot be decrypted are skipped and reported.
 */
describe("Phase E: Payment status semantics & immutable files (§12)", () => {
  let app: FastifyInstance;

  const officeSession = signedSession({
    id: "user-office-1",
    role: "office_manager",
    name: "Anil Kadam",
  });

  const purchaseIds = [
    "a0000000-0000-0000-0000-000000000001",
    "a0000000-0000-0000-0000-000000000002",
    "a0000000-0000-0000-0000-000000000003",
  ];

  async function setAllApproved() {
    await db
      .update(schema.purchases)
      .set({ status: "approved" })
      .where(inArray(schema.purchases.id, purchaseIds));
  }

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
    await runSeed(db);
    await setAllApproved();
  });

  it("marks included purchases in_payment at run creation and stores the CSV verbatim", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/payment-runs",
      cookies: { session: officeSession },
      payload: {},
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.purchaseCount).toBe(3);

    // Every included purchase is 'in_payment', none is 'paid' yet (§12)
    const statuses = await db
      .select({ id: schema.purchases.id, status: schema.purchases.status })
      .from(schema.purchases)
      .where(inArray(schema.purchases.id, purchaseIds));
    expect(statuses.every((p) => p.status === "in_payment")).toBe(true);
    expect(statuses.some((p) => p.status === "paid")).toBe(false);

    // in_payment purchases are NOT eligible for another run
    const eligibleRes = await app.inject({
      method: "GET",
      url: "/payment-runs/eligible-purchases",
      cookies: { session: officeSession },
    });
    const eligible = JSON.parse(eligibleRes.payload).eligiblePurchases as Array<{ id: string }>;
    expect(eligible.some((p) => purchaseIds.includes(p.id))).toBe(false);

    // The run row stores the generated file bytes verbatim
    const [run] = await db
      .select()
      .from(schema.paymentRuns)
      .where(eq(schema.paymentRuns.id, body.runId));
    expect(run.fileContent).toBeTruthy();
    expect(run.fileContent).toContain("Beneficiary Name");
  });

  it("serves byte-identical file downloads even after live member bank edits", async () => {
    // Find the run created above (only one exists at this point)
    const [run] = await db.select().from(schema.paymentRuns).limit(1);

    const first = await app.inject({
      method: "GET",
      url: `/payment-runs/${run.id}/file`,
      cookies: { session: officeSession },
    });
    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toContain("text/csv");

    // The downloaded bytes are EXACTLY the stored bytes (§12 immutability)
    expect(first.payload).toBe(run.fileContent);

    // Mutate a live member row's bank account — the stored file must not change
    await app.inject({
      method: "PATCH",
      url: "/members/member-1",
      cookies: { session: officeSession },
      payload: { bankAccount: "999999999999", ifsc: "PUNB0999999" },
    });

    const second = await app.inject({
      method: "GET",
      url: `/payment-runs/${run.id}/file`,
      cookies: { session: officeSession },
    });
    expect(second.statusCode).toBe(200);
    expect(second.payload).toBe(first.payload);
    expect(second.payload).not.toContain("999999999999");
  });

  it("marks purchases paid only after item success; failed items return to approved and re-enter eligibility", async () => {
    // Freshly approve all purchases and create a new run
    await setAllApproved();
    const createRes = await app.inject({
      method: "POST",
      url: "/payment-runs",
      cookies: { session: officeSession },
      payload: {},
    });
    expect(createRes.statusCode).toBe(201);
    const runId = (JSON.parse(createRes.payload) as { runId: string }).runId;

    // Fail the first item, succeed the rest
    const statusRes = await app.inject({
      method: "POST",
      url: `/payment-runs/${runId}/status`,
      cookies: { session: officeSession },
      payload: { simulateOneFailureIndex: 0 },
    });
    expect(statusRes.statusCode).toBe(200);

    const items = await db
      .select()
      .from(schema.paymentItems)
      .where(eq(schema.paymentItems.runId, runId));

    const failedItem = items.find((i) => i.status === "failed");
    const successItems = items.filter((i) => i.status === "success");
    expect(failedItem).toBeDefined();
    expect(successItems.length).toBeGreaterThan(0);

    // Success => purchases paid; failed => purchases approved again
    const successPurchaseIds = successItems.flatMap((i) => i.purchaseIds);
    const [successStatuses] = await Promise.all([
      db
        .select({ id: schema.purchases.id, status: schema.purchases.status })
        .from(schema.purchases)
        .where(inArray(schema.purchases.id, successPurchaseIds)),
    ]);
    expect(successStatuses.every((p) => p.status === "paid")).toBe(true);

    const failedPurchaseIds = failedItem!.purchaseIds;
    const failedStatuses = await db
      .select({ id: schema.purchases.id, status: schema.purchases.status })
      .from(schema.purchases)
      .where(inArray(schema.purchases.id, failedPurchaseIds));
    expect(failedStatuses.every((p) => p.status === "approved")).toBe(true);

    // Failed purchases re-enter the eligible list (bank-verified member)
    const eligibleRes = await app.inject({
      method: "GET",
      url: "/payment-runs/eligible-purchases",
      cookies: { session: officeSession },
    });
    const eligible = JSON.parse(eligibleRes.payload).eligiblePurchases as Array<{ id: string }>;
    expect(
      failedPurchaseIds.every((pid) => eligible.some((p) => p.id === pid))
    ).toBe(true);

    // Retrying moves them back into the pipeline (in_payment again)
    const retryRes = await app.inject({
      method: "POST",
      url: `/payment-runs/${runId}/retry-failed`,
      cookies: { session: officeSession },
    });
    expect(retryRes.statusCode).toBe(201);
    const retryStatuses = await db
      .select({ id: schema.purchases.id, status: schema.purchases.status })
      .from(schema.purchases)
      .where(inArray(schema.purchases.id, failedPurchaseIds));
    expect(retryStatuses.every((p) => p.status === "in_payment")).toBe(true);
  });

  it("rejects item status updates that belong to a different run", async () => {
    // Create two runs; both need eligible purchases, so split them
    await setAllApproved();
    const runARes = await app.inject({
      method: "POST",
      url: "/payment-runs",
      cookies: { session: officeSession },
      payload: { purchaseIds: [purchaseIds[0]] },
    });
    expect(runARes.statusCode).toBe(201);
    const runAId = (JSON.parse(runARes.payload) as { runId: string }).runId;

    const runBRes = await app.inject({
      method: "POST",
      url: "/payment-runs",
      cookies: { session: officeSession },
      payload: { purchaseIds: [purchaseIds[1]] },
    });
    expect(runBRes.statusCode).toBe(201);
    const runBId = (JSON.parse(runBRes.payload) as { runId: string }).runId;

    const [runBItem] = await db
      .select()
      .from(schema.paymentItems)
      .where(eq(schema.paymentItems.runId, runBId));

    // Attempt to update run B's item through run A's endpoint
    const res = await app.inject({
      method: "POST",
      url: `/payment-runs/${runAId}/status`,
      cookies: { session: officeSession },
      payload: { itemStatuses: [{ itemId: runBItem.id, status: "success" }] },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error).toBe("ITEM_NOT_IN_RUN");

    // Run B's item was not touched
    const [runBItemAfter] = await db
      .select()
      .from(schema.paymentItems)
      .where(eq(schema.paymentItems.id, runBItem.id));
    expect(runBItemAfter.status).toBe("queued");
  });

  it("skips and reports purchases whose snapshot cannot be decrypted", async () => {
    // Corrupt purchase-3's snapshot, then approve both it and a healthy
    // purchase-2 so the run succeeds but reports the skipped one.
    await db
      .update(schema.purchases)
      .set({ memberSnapshotJson: "not-a-valid-ciphertext" })
      .where(eq(schema.purchases.id, purchaseIds[2]));

    await db
      .update(schema.purchases)
      .set({ status: "approved" })
      .where(inArray(schema.purchases.id, [purchaseIds[1], purchaseIds[2]]));

    const res = await app.inject({
      method: "POST",
      url: "/payment-runs",
      cookies: { session: officeSession },
      payload: { purchaseIds: [purchaseIds[1], purchaseIds[2]] },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.purchaseCount).toBe(1);
    expect(body.skippedPurchases).toEqual([
      expect.objectContaining({
        purchaseId: purchaseIds[2],
        reason: "SNAPSHOT_DECRYPT_FAILED",
      }),
    ]);
  });
});
