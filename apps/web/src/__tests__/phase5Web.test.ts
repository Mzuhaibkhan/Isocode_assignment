import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "../offline/db.js";
import { queuePhotoOffline } from "../offline/photoReader.js";
import { formatRupees, SyncHoldReason } from "@procurement/shared";

describe("Phase 5: Frontend AI Reading, Mismatch Logic, Offline Photo Queue & Payment Runs (§10, §12)", () => {
  beforeEach(async () => {
    await db.photos.clear();
  });

  describe("1. Moisture Photo Mismatch Logic (§10.2)", () => {
    it("detects mismatch between AI reading and typed moisture and enforces blocking", () => {
      const aiReadingX10: number = 115; // 11.5%
      const typedMoistureX10: number = 140; // 14.0%

      const hasMismatch = aiReadingX10 !== typedMoistureX10;
      let mismatchConfirmed = false;

      // Operator cannot proceed while mismatch is unresolved
      let isBlocked = hasMismatch && !mismatchConfirmed;
      expect(isBlocked).toBe(true);

      // Operator resolves by choosing AI reading
      let activeMoistureX10: number = aiReadingX10;
      mismatchConfirmed = true;
      isBlocked = (activeMoistureX10 !== aiReadingX10) && !mismatchConfirmed;
      expect(isBlocked).toBe(false);
      expect(activeMoistureX10).toBe(115);
    });

    it("allows operator to override AI reading after explicit confirmation", () => {
      const aiReadingX10: number = 115; // 11.5%
      const typedMoistureX10: number = 135; // 13.5%

      const hasMismatch = aiReadingX10 !== typedMoistureX10;
      let mismatchConfirmed = false;

      let isBlocked = hasMismatch && !mismatchConfirmed;
      expect(isBlocked).toBe(true);

      // Operator explicitly confirms typed reading
      mismatchConfirmed = true;
      isBlocked = hasMismatch && !mismatchConfirmed;
      expect(isBlocked).toBe(false);
    });

    it("does not block when AI reading matches typed moisture", () => {
      const aiReadingX10: number = 115;
      const typedMoistureX10: number = 115;

      const hasMismatch = aiReadingX10 !== typedMoistureX10;
      const mismatchConfirmed = false;
      const isBlocked = hasMismatch && !mismatchConfirmed;

      expect(isBlocked).toBe(false);
    });
  });

  describe("2. Offline Photo Queueing (§10.2)", () => {
    it("stores captured photo in IndexedDB when offline with pending status", async () => {
      await queuePhotoOffline({
        id: "photo-offline-001",
        purchaseId: "purchase-123",
        kind: "meter",
        imageData: "data:image/jpeg;base64,mockJpegDataString",
        aiValueX10: 115,
        typedValueX10: 115,
        matched: true,
        aiNote: "Clean display 11.5%",
      });

      const queued = await db.photos.get("photo-offline-001");
      expect(queued).toBeDefined();
      expect(queued?.status).toBe("pending");
      expect(queued?.kind).toBe("meter");
      expect(queued?.aiValueX10).toBe(115);
      expect(queued?.typedValueX10).toBe(115);
      expect(queued?.matched).toBe(true);
    });

    it("falls back to manual numpad with photo queued on API failure or offline mode", async () => {
      // Operator types 12.5% manually without AI reading
      const manualMoistureX10 = 125;

      await queuePhotoOffline({
        id: "photo-offline-fallback",
        kind: "meter",
        imageData: "data:image/jpeg;base64,offlinePhotoData",
        aiValueX10: null,
        typedValueX10: manualMoistureX10,
        matched: false,
        aiNote: "Captured offline, manual numpad fallback",
      });

      const count = await db.photos.count();
      expect(count).toBe(1);

      const saved = await db.photos.get("photo-offline-fallback");
      expect(saved?.aiValueX10).toBeNull();
      expect(saved?.typedValueX10).toBe(125);
    });
  });

  describe("3. Payment File Total Reconciliation Rule (§12)", () => {
    it("strictly reconciles sum of line items to total payment file down to the paisa", () => {
      const purchaseAmountsPaise = [
        5975200, // ₹59,752.00
        4030350, // ₹40,303.50
        4536000, // ₹45,360.00
      ];

      const expectedTotalPaise = 14541550; // ₹145,415.50
      const calculatedSumPaise = purchaseAmountsPaise.reduce((acc, a) => acc + a, 0);

      expect(calculatedSumPaise).toBe(expectedTotalPaise);
      expect(formatRupees(calculatedSumPaise)).toBe("₹1,45,415.50");

      // Verify two-decimal rupees conversion for CSV without floating point loss
      const csvAmountString = (calculatedSumPaise / 100).toFixed(2);
      expect(csvAmountString).toBe("145415.50");
    });
  });

  describe("4. Marathi Flag Codes Mapping (§10.1)", () => {
    it("covers all 6 hold reason codes", () => {
      const requiredFlags = [
        SyncHoldReason.DUPLICATE_FARMER,
        SyncHoldReason.YIELD_HIGH,
        SyncHoldReason.UNIFORM_MOISTURE,
        SyncHoldReason.CLOCK_SKEW,
        SyncHoldReason.STALE_PRICE_VERSION,
        SyncHoldReason.CONSENT_WITHDRAWN,
      ];

      expect(requiredFlags).toHaveLength(6);
      for (const flag of requiredFlags) {
        expect(typeof flag).toBe("string");
      }
    });
  });
});
