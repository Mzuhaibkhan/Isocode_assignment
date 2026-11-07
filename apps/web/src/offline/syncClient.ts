import { db, OutboxEntry } from "./db.js";
import { getOrCreateDeviceKey, registerDeviceWithServer } from "./signer.js";
import { syncMembersAndPrices } from "./syncMembersAndPrices.js";
import type { SyncRejectionReasonType, SyncHoldReasonType } from "@procurement/shared";

export interface SyncStats {
  syncedCount: number;
  heldCount: number;
  rejectedCount: number;
  duplicateCount: number;
  totalPending: number;
  lastSyncedAt?: string;
  error?: string;
}

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  heldCount: number;
  rejectedCount: number;
  duplicateCount: number;
  results?: Array<{
    id: string;
    slipNo: string;
    status: "accepted" | "held" | "duplicate" | "rejected";
    reason?: SyncRejectionReasonType | SyncHoldReasonType | string;
  }>;
  error?: string;
}

/**
 * Upload pending outbox entries to the server in strict sequence order (§9.6).
 * Sends up to 10 entries per batch and updates local outbox status based on server response.
 */
export async function syncPurchases(): Promise<SyncResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      success: false,
      syncedCount: 0,
      heldCount: 0,
      rejectedCount: 0,
      duplicateCount: 0,
      error: "Device is offline",
    };
  }

  // 1. Fetch pending outbox entries in strict sequence order
  const pendingEntries = await db.outbox
    .where("status")
    .equals("pending")
    .sortBy("seq");

  if (pendingEntries.length === 0) {
    return {
      success: true,
      syncedCount: 0,
      heldCount: 0,
      rejectedCount: 0,
      duplicateCount: 0,
    };
  }

  // 2. Ensure device is registered
  const { deviceId } = await getOrCreateDeviceKey();
  try {
    await registerDeviceWithServer();
  } catch {
    // If device registration check fails, attempt batch sync anyway
  }

  // 3. Process pending entries in chunks of 10 (§9.6)
  const CHUNK_SIZE = 10;
  let totalSynced = 0;
  let totalHeld = 0;
  let totalRejected = 0;
  let totalDuplicate = 0;
  const allResults: NonNullable<SyncResult["results"]> = [];

  for (let i = 0; i < pendingEntries.length; i += CHUNK_SIZE) {
    const chunk = pendingEntries.slice(i, i + CHUNK_SIZE);

    const entriesPayload = chunk.map((e) => ({
      ...e.payload,
      prevHash: e.prevHash,
      entryHash: e.entryHash,
      signature: e.signature,
    }));

    try {
      // First try /api/sync/purchases, fallback to /sync/purchases
      let res = await fetch("/api/sync/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          entries: entriesPayload,
        }),
      });

      if (!res.ok && res.status === 404) {
        res = await fetch("/sync/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId,
            entries: entriesPayload,
          }),
        });
      }

      const data = await res.json();
      const results: Array<{
        id: string;
        slipNo: string;
        status: "accepted" | "held" | "duplicate" | "rejected";
        reason?: string;
      }> = data.results || [];

      // Update Dexie outbox items according to response
      for (const itemResult of results) {
        allResults.push(itemResult);

        const localEntry = chunk.find((c) => c.id === itemResult.id);
        if (!localEntry) continue;

        if (
          itemResult.status === "accepted" ||
          itemResult.status === "held" ||
          itemResult.status === "duplicate"
        ) {
          await db.outbox.update(localEntry.id, {
            status: "synced",
            reason: itemResult.reason,
          });

          if (itemResult.status === "accepted") totalSynced++;
          else if (itemResult.status === "held") totalHeld++;
          else totalDuplicate++;
        } else if (itemResult.status === "rejected") {
          await db.outbox.update(localEntry.id, {
            status: "rejected",
            reason: itemResult.reason || "REJECTED",
          });
          totalRejected++;
        }
      }

      // If the batch failed completely (e.g. DEVICE_REVOKED with 403)
      if (!res.ok && results.length === 0) {
        const errorReason = data.error || "DEVICE_REVOKED";
        for (const c of chunk) {
          await db.outbox.update(c.id, {
            status: "rejected",
            reason: errorReason,
          });
          totalRejected++;
        }
      }
    } catch (err: any) {
      console.warn("Sync chunk failed:", err);
      return {
        success: false,
        syncedCount: totalSynced,
        heldCount: totalHeld,
        rejectedCount: totalRejected,
        duplicateCount: totalDuplicate,
        results: allResults,
        error: err.message || "Network error",
      };
    }
  }

  // 4. If any items were accepted or held, refresh members and price cache
  if (totalSynced > 0 || totalHeld > 0) {
    try {
      await syncMembersAndPrices();
    } catch (err) {
      console.warn("Post-sync cache refresh failed:", err);
    }
  }

  return {
    success: true,
    syncedCount: totalSynced,
    heldCount: totalHeld,
    rejectedCount: totalRejected,
    duplicateCount: totalDuplicate,
    results: allResults,
  };
}

/**
 * Simulates tampering with an outbox entry to demonstrate server-side tamper rejection (§17 demo step 4).
 * Mutates `payload.grossX10` without recomputing the entry hash or signature.
 */
export async function simulateTamperOutbox(entryId?: string): Promise<OutboxEntry | null> {
  let target: OutboxEntry | undefined;

  if (entryId) {
    target = await db.outbox.get(entryId);
  } else {
    // Find latest pending or any latest entry
    target = await db.outbox.where("status").equals("pending").first();
    if (!target) {
      const all = await db.outbox.toArray();
      target = all[all.length - 1];
    }
  }

  if (!target) return null;

  // Tamper: alter gross weight in payload
  const currentGross = (target.payload.grossX10 as number) || 12500;
  const tamperedPayload = {
    ...target.payload,
    grossX10: currentGross + 5000, // add 500 kg
  };

  const tamperedEntry: OutboxEntry = {
    ...target,
    payload: tamperedPayload,
    status: "pending",
    reason: undefined,
  };

  await db.outbox.put(tamperedEntry);
  return tamperedEntry;
}

/**
 * Starts the automatic upload loop (§9.6):
 * - Runs on app startup
 * - Runs whenever the 'online' window event fires
 * - Runs periodically every 30 seconds while online
 */
export function startSyncLoop(onSyncStats?: (stats: SyncStats) => void): () => void {
  let intervalId: any = null;

  const trigger = async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const pendingCount = await db.outbox.where("status").equals("pending").count();
      onSyncStats?.({
        syncedCount: 0,
        heldCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        totalPending: pendingCount,
      });
      return;
    }

    try {
      const res = await syncPurchases();
      const pendingCount = await db.outbox.where("status").equals("pending").count();
      onSyncStats?.({
        syncedCount: res.syncedCount,
        heldCount: res.heldCount,
        rejectedCount: res.rejectedCount,
        duplicateCount: res.duplicateCount,
        totalPending: pendingCount,
        lastSyncedAt: new Date().toISOString(),
        error: res.error,
      });
    } catch (err: any) {
      const pendingCount = await db.outbox.where("status").equals("pending").count();
      onSyncStats?.({
        syncedCount: 0,
        heldCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        totalPending: pendingCount,
        error: err.message,
      });
    }
  };

  // 1. Initial trigger
  trigger();

  // 2. Listen for 'online' event
  const handleOnline = () => {
    trigger();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
    // 3. Periodic timer (30 seconds)
    intervalId = setInterval(trigger, 30_000);
  }

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
    }
    if (intervalId) {
      clearInterval(intervalId);
    }
  };
}
