import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { AppDB } from "../offline/db.js";
import { getOrCreateDeviceKey } from "../offline/signer.js";
import { enqueuePurchase } from "../offline/queue.js";
import { syncPurchases, simulateTamperOutbox } from "../offline/syncClient.js";
import { entryHash, verifySignature } from "@procurement/shared";

describe("Phase 4: Client Offline-First Tamper-Proof Sync (§9.1 - §9.8)", () => {
  let db: AppDB;

  beforeEach(async () => {
    // Reset Dexie DB
    db = new AppDB();
    await db.open();
    await db.outbox.clear();
    await db.members.clear();
    await db.prices.clear();
    await db.meta.clear();
    vi.restoreAllMocks();
  });

  it("generates an ECDSA P-256 key pair and reuses it across calls (§9.1)", async () => {
    const dev1 = await getOrCreateDeviceKey();
    expect(dev1.deviceId).toBeDefined();
    expect(dev1.deviceId).toMatch(/^dev-/);
    expect(dev1.keyPair.privateKey).toBeDefined();
    expect(dev1.keyPair.publicKey).toBeDefined();
    expect(dev1.publicKeyJwk).toContain("EC");

    // Second call should return the exact same deviceId and public key
    const dev2 = await getOrCreateDeviceKey();
    expect(dev2.deviceId).toBe(dev1.deviceId);
    expect(dev2.publicKeyJwk).toBe(dev1.publicKeyJwk);
  });

  it("enqueues purchases in outbox with strictly increasing sequence and valid hash chain (§9.5)", async () => {
    // Seed a member
    await db.members.put({
      id: "mem-01",
      farmerCode: "C07-001",
      name: "सुनील जाधव",
      village: "Ausa",
      landTenthsAcre: 50,
      mobile: "9822012345",
      bankAccountMasked: "••••••••1234",
      ifsc: "MAHB0000123",
      bankVerified: true,
      consentWithdrawn: false,
      nameTokens: ["सुनील", "जाधव"],
    });

    // 1. Enqueue First Purchase
    const p1 = await enqueuePurchase({
      memberId: "mem-01",
      farmerName: "सुनील जाधव",
      crop: "Soybean",
      grade: "FAQ",
      grossX10: 12500, // 1250.0 kg
      tareX10: 180,    // 18.0 kg
      moistureX10: 115, // 11.5%
      ratePaise: 485000,
      priceVersion: 1,
      centreCode: "C07",
    });

    expect(p1.outboxEntry.seq).toBe(1);
    expect(p1.outboxEntry.prevHash).toBe("0".repeat(64)); // 64 zeros for first entry
    expect(p1.outboxEntry.status).toBe("pending");
    expect(p1.slip.amountFormatted).toBe("₹59,752.00");
    expect(p1.slip.netKg).toBe("1232.0");

    // Verify ECDSA signature of first entry
    const dev = await getOrCreateDeviceKey();
    const isSigValid1 = await verifySignature(
      dev.publicKeyJwk,
      p1.outboxEntry.signature,
      p1.outboxEntry.entryHash
    );
    expect(isSigValid1).toBe(true);

    // 2. Enqueue Second Purchase
    const p2 = await enqueuePurchase({
      memberId: "mem-01",
      farmerName: "सुनील जाधव",
      crop: "Soybean",
      grade: "FAQ",
      grossX10: 8600,  // 860.0 kg
      tareX10: 120,   // 12.0 kg
      moistureX10: 140, // 14.0%
      ratePaise: 485000,
      priceVersion: 1,
      centreCode: "C07",
    });

    expect(p2.outboxEntry.seq).toBe(2);
    // Sequence increment & Hash chain continuity: prevHash of p2 must equal entryHash of p1!
    expect(p2.outboxEntry.prevHash).toBe(p1.outboxEntry.entryHash);
    expect(p2.slip.amountFormatted).toBe("₹40,303.50");
    expect(p2.slip.netKg).toBe("831.0");

    const isSigValid2 = await verifySignature(
      dev.publicKeyJwk,
      p2.outboxEntry.signature,
      p2.outboxEntry.entryHash
    );
    expect(isSigValid2).toBe(true);

    // Verify outbox count
    const allPending = await db.outbox.toArray();
    expect(allPending.length).toBe(2);
  });

  it("blocks recording purchase when member consent is withdrawn (§9.5)", async () => {
    // Seed member with consent withdrawn
    await db.members.put({
      id: "mem-withdrawn",
      farmerCode: "C07-999",
      name: "सुरेश कदम",
      village: "Renapur",
      landTenthsAcre: 30,
      mobile: "9822099999",
      bankAccountMasked: "••••••••9999",
      ifsc: "MAHB0000123",
      bankVerified: true,
      consentWithdrawn: true,
      nameTokens: ["सुरेश", "कदम"],
    });

    await expect(
      enqueuePurchase({
        memberId: "mem-withdrawn",
        farmerName: "सुरेश कदम",
        crop: "Soybean",
        grade: "FAQ",
        grossX10: 10000,
        tareX10: 100,
        moistureX10: 120,
        ratePaise: 485000,
        priceVersion: 1,
      })
    ).rejects.toThrow(/DPDP कायद्यांतर्गत संमती मागे घेतली आहे/);

    const outboxCount = await db.outbox.count();
    expect(outboxCount).toBe(0);
  });

  it("detects local data tampering (simulateTamperOutbox alters payload causing hash mismatch) (§17 demo)", async () => {
    // Seed member & purchase
    await db.members.put({
      id: "mem-01",
      farmerCode: "C07-001",
      name: "सुनील जाधव",
      village: "Ausa",
      landTenthsAcre: 50,
      mobile: "9822012345",
      bankAccountMasked: "••••••••1234",
      ifsc: "MAHB0000123",
      bankVerified: true,
      consentWithdrawn: false,
      nameTokens: ["सुनील", "जाधव"],
    });

    const { outboxEntry } = await enqueuePurchase({
      memberId: "mem-01",
      farmerName: "सुनील जाधव",
      crop: "Soybean",
      grade: "FAQ",
      grossX10: 12500,
      tareX10: 180,
      moistureX10: 115,
      ratePaise: 485000,
      priceVersion: 1,
    });

    // Verify hash matches untampered payload
    const originalHash = await entryHash(outboxEntry.payload, outboxEntry.prevHash);
    expect(originalHash).toBe(outboxEntry.entryHash);

    // Tamper with gross weight in IndexedDB
    const tampered = await simulateTamperOutbox(outboxEntry.id);
    expect(tampered).not.toBeNull();
    expect(tampered?.payload.grossX10).toBe(12500 + 5000); // 17500 instead of 12500

    // When server verifies hash from payload + prevHash:
    const tamperedHash = await entryHash(tampered?.payload, tampered!.prevHash);
    expect(tamperedHash).not.toBe(tampered?.entryHash); // HASH MISMATCH!
  });

  it("uploads pending purchases through syncPurchases and updates outbox to synced (§9.6)", async () => {
    // Seed member & purchase
    await db.members.put({
      id: "mem-01",
      farmerCode: "C07-001",
      name: "सुनील जाधव",
      village: "Ausa",
      landTenthsAcre: 50,
      mobile: "9822012345",
      bankAccountMasked: "••••••••1234",
      ifsc: "MAHB0000123",
      bankVerified: true,
      consentWithdrawn: false,
      nameTokens: ["सुनील", "जाधव"],
    });

    const { outboxEntry } = await enqueuePurchase({
      memberId: "mem-01",
      farmerName: "सुनील जाधव",
      crop: "Soybean",
      grade: "FAQ",
      grossX10: 12500,
      tareX10: 180,
      moistureX10: 115,
      ratePaise: 485000,
      priceVersion: 1,
    });

    // Mock fetch for server response
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/devices/register")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, registeredAt: new Date().toISOString() }),
        });
      }
      if (url.includes("/sync/purchases")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              results: [
                {
                  id: outboxEntry.id,
                  slipNo: (outboxEntry.payload as any).slipNo,
                  status: "accepted",
                },
              ],
              syncedCount: 1,
              heldCount: 0,
              rejectedCount: 0,
              duplicateCount: 0,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    globalThis.fetch = mockFetch;

    const syncRes = await syncPurchases();
    expect(syncRes.success).toBe(true);
    expect(syncRes.syncedCount).toBe(1);

    // Verify outbox entry is updated to "synced"
    const updated = await db.outbox.get(outboxEntry.id);
    expect(updated?.status).toBe("synced");
  });

  it("marks outbox entries as rejected with server-provided reason on rejection (§9.6)", async () => {
    await db.members.put({
      id: "mem-01",
      farmerCode: "C07-001",
      name: "सुनील जाधव",
      village: "Ausa",
      landTenthsAcre: 50,
      mobile: "9822012345",
      bankAccountMasked: "••••••••1234",
      ifsc: "MAHB0000123",
      bankVerified: true,
      consentWithdrawn: false,
      nameTokens: ["सुनील", "जाधव"],
    });

    const { outboxEntry } = await enqueuePurchase({
      memberId: "mem-01",
      farmerName: "सुनील जाधव",
      crop: "Soybean",
      grade: "FAQ",
      grossX10: 12500,
      tareX10: 180,
      moistureX10: 115,
      ratePaise: 485000,
      priceVersion: 1,
    });

    // Mock server returning HASH_MISMATCH
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/devices/register")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        });
      }
      if (url.includes("/sync/purchases")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              results: [
                {
                  id: outboxEntry.id,
                  slipNo: (outboxEntry.payload as any).slipNo,
                  status: "rejected",
                  reason: "HASH_MISMATCH",
                },
              ],
              syncedCount: 0,
              rejectedCount: 1,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const syncRes = await syncPurchases();
    expect(syncRes.rejectedCount).toBe(1);

    const updated = await db.outbox.get(outboxEntry.id);
    expect(updated?.status).toBe("rejected");
    expect(updated?.reason).toBe("HASH_MISMATCH");
  });

  it("handles offline state gracefully without attempting network requests (§9.6)", async () => {
    Object.defineProperty(globalThis.navigator, "onLine", {
      value: false,
      configurable: true,
      writable: true,
    });

    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const res = await syncPurchases();
    expect(res.success).toBe(false);
    expect(res.error).toBe("Device is offline");
    expect(fetchSpy).not.toHaveBeenCalled();

    Object.defineProperty(globalThis.navigator, "onLine", {
      value: true,
      configurable: true,
      writable: true,
    });
  });

  it("Full Offline Demo Workflow: go offline, record three purchases, reconnect, assert synced; tamper test (§17 demo)", async () => {
    // 1. Seed members into Dexie
    await db.members.bulkPut([
      {
        id: "mem-01",
        farmerCode: "C07-001",
        name: "सुनील जाधव",
        village: "Ausa",
        landTenthsAcre: 50,
        mobile: "9822012345",
        bankAccountMasked: "••••••••1234",
        ifsc: "MAHB0000123",
        bankVerified: true,
        consentWithdrawn: false,
        nameTokens: ["सुनील", "जाधव"],
      },
      {
        id: "mem-02",
        farmerCode: "C07-002",
        name: "कमल शिंदे",
        village: "Renapur",
        landTenthsAcre: 35,
        mobile: "9822054321",
        bankAccountMasked: "••••••••5678",
        ifsc: "MAHB0000123",
        bankVerified: true,
        consentWithdrawn: false,
        nameTokens: ["कमल", "शिंदे"],
      },
      {
        id: "mem-03",
        farmerCode: "C12-003",
        name: "मोहन बिरादार",
        village: "Nilanga",
        landTenthsAcre: 40,
        mobile: "9822077777",
        bankAccountMasked: "••••••••9012",
        ifsc: "MAHB0000123",
        bankVerified: true,
        consentWithdrawn: false,
        nameTokens: ["मोहन", "बिरादार"],
      },
    ]);

    // 2. Simulate Airplane mode / Offline network
    Object.defineProperty(globalThis.navigator, "onLine", {
      value: false,
      configurable: true,
      writable: true,
    });

    // 3. Record Three Purchases Offline
    const p1 = await enqueuePurchase({
      memberId: "mem-01",
      farmerName: "सुनील जाधव",
      crop: "Soybean",
      grade: "FAQ",
      grossX10: 12500,
      tareX10: 180,
      moistureX10: 115,
      ratePaise: 485000,
      priceVersion: 1,
    });
    expect(p1.slip.smsStatus).toBe("offline");
    expect(p1.outboxEntry.seq).toBe(1);

    const p2 = await enqueuePurchase({
      memberId: "mem-02",
      farmerName: "कमल शिंदे",
      crop: "Soybean",
      grade: "FAQ",
      grossX10: 8600,
      tareX10: 120,
      moistureX10: 140,
      ratePaise: 485000,
      priceVersion: 1,
    });
    expect(p2.slip.smsStatus).toBe("offline");
    expect(p2.outboxEntry.seq).toBe(2);
    expect(p2.outboxEntry.prevHash).toBe(p1.outboxEntry.entryHash);

    const p3 = await enqueuePurchase({
      memberId: "mem-03",
      farmerName: "मोहन बिरादार",
      crop: "Tur",
      grade: "FAQ",
      grossX10: 6400,
      tareX10: 100,
      moistureX10: 100,
      ratePaise: 720000,
      priceVersion: 1,
    });
    expect(p3.slip.smsStatus).toBe("offline");
    expect(p3.outboxEntry.seq).toBe(3);
    expect(p3.outboxEntry.prevHash).toBe(p2.outboxEntry.entryHash);

    // Verify 3 items are pending in local outbox
    const pendingList = await db.outbox.where("status").equals("pending").toArray();
    expect(pendingList.length).toBe(3);

    // Attempting sync while offline returns immediately without throwing
    const offlineSync = await syncPurchases();
    expect(offlineSync.success).toBe(false);
    expect(offlineSync.error).toBe("Device is offline");

    // 4. Reconnect network (Airplane mode turned off)
    Object.defineProperty(globalThis.navigator, "onLine", {
      value: true,
      configurable: true,
      writable: true,
    });

    // Mock backend accepting all 3 entries
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (url.includes("/devices/register")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, registeredAt: new Date().toISOString() }),
        });
      }
      if (url.includes("/sync/purchases")) {
        const body = JSON.parse(opts?.body || "{}");
        const acceptedResults = (body.entries || []).map((e: any) => ({
          id: e.id,
          slipNo: e.slipNo,
          status: "accepted",
        }));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              results: acceptedResults,
              syncedCount: acceptedResults.length,
              heldCount: 0,
              rejectedCount: 0,
              duplicateCount: 0,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    // 5. Trigger sync loop
    const onlineSync = await syncPurchases();
    expect(onlineSync.success).toBe(true);
    expect(onlineSync.syncedCount).toBe(3);

    // Assert all 3 entries are now 'synced' in IndexedDB
    const remainingPending = await db.outbox.where("status").equals("pending").count();
    expect(remainingPending).toBe(0);

    const syncedEntries = await db.outbox.where("status").equals("synced").toArray();
    expect(syncedEntries.length).toBe(3);

    // 6. Tamper Test: mutate an entry's gross weight in IndexedDB and attempt sync
    const tampered = await simulateTamperOutbox(p1.outboxEntry.id);
    expect(tampered?.payload.grossX10).toBe(12500 + 5000);

    // Server returns HASH_MISMATCH for tampered entry
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/devices/register")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      if (url.includes("/sync/purchases")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              results: [
                {
                  id: p1.outboxEntry.id,
                  slipNo: (p1.outboxEntry.payload as any).slipNo,
                  status: "rejected",
                  reason: "HASH_MISMATCH",
                },
              ],
              syncedCount: 0,
              rejectedCount: 1,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const tamperSync = await syncPurchases();
    expect(tamperSync.rejectedCount).toBe(1);

    const tamperedFromDb = await db.outbox.get(p1.outboxEntry.id);
    expect(tamperedFromDb?.status).toBe("rejected");
    expect(tamperedFromDb?.reason).toBe("HASH_MISMATCH");
  });
});
