import { describe, it, expect } from "vitest";
import {
  isDuplicateFarmerTime,
  isYieldHigh,
  isUniformMoisture,
  calculateStandardDeviation,
  isClockSkewed,
} from "../flags/index.js";

describe("Phase 5: Flag Rules Pure Functions (§10.1)", () => {
  describe("DUPLICATE_FARMER Flag Rule", () => {
    const now = new Date("2026-11-06T10:00:00Z");

    it("flags duplicate if same member had purchase 15 minutes ago", () => {
      const prior = [new Date("2026-11-06T09:45:00Z")];
      expect(isDuplicateFarmerTime(now, prior, 60)).toBe(true);
    });

    it("flags duplicate if same member had purchase exactly 60 minutes ago", () => {
      const prior = [new Date("2026-11-06T09:00:00Z")];
      expect(isDuplicateFarmerTime(now, prior, 60)).toBe(true);
    });

    it("does not flag if prior purchase was 61 minutes ago", () => {
      const prior = [new Date("2026-11-06T08:59:00Z")];
      expect(isDuplicateFarmerTime(now, prior, 60)).toBe(false);
    });

    it("does not flag if no prior purchases exist", () => {
      expect(isDuplicateFarmerTime(now, [], 60)).toBe(false);
    });
  });

  describe("YIELD_HIGH Flag Rule", () => {
    // 5.0 acres = 50 landTenthsAcre
    // Soybean max yield = 1,200 kg/acre -> max quota = 6,000 kg = 60,000 tenths
    const landTenthsAcre = 50;

    it("allows deliveries within acre quota", () => {
      const priorSeasonNetX10 = 20000; // 2,000 kg
      const currentNetX10 = 15000;     // 1,500 kg
      // Total 3,500 kg <= 6,000 kg
      expect(isYieldHigh(landTenthsAcre, priorSeasonNetX10, currentNetX10, "Soybean")).toBe(false);
    });

    it("flags delivery when season total exceeds maximum yield per acre", () => {
      const priorSeasonNetX10 = 55000; // 5,500 kg
      const currentNetX10 = 10000;     // 1,000 kg
      // Total 6,500 kg > 6,000 kg
      expect(isYieldHigh(landTenthsAcre, priorSeasonNetX10, currentNetX10, "Soybean")).toBe(true);
    });

    it("flags any delivery if land acres is zero", () => {
      expect(isYieldHigh(0, 0, 1000, "Soybean")).toBe(true);
    });

    it("respects Tur crop threshold (default 800 kg/acre)", () => {
      // 5.0 acres × 800 kg/acre = 4,000 kg = 40,000 tenths
      expect(isYieldHigh(landTenthsAcre, 35000, 4000, "Tur")).toBe(false); // 3,900 kg <= 4,000 kg
      expect(isYieldHigh(landTenthsAcre, 35000, 6000, "Tur")).toBe(true);  // 4,100 kg > 4,000 kg
    });
  });

  describe("UNIFORM_MOISTURE Flag Rule", () => {
    it("does not flag if readings count is below 20", () => {
      const readings = [115, 115, 115, 115, 115]; // only 5 readings
      expect(isUniformMoisture(readings, 20)).toBe(false);
    });

    it("flags when 20 consecutive readings have std dev below 0.3 points (3 tenths)", () => {
      // 20 readings with virtually identical values (e.g. 11.5%, 11.4%, 11.5%)
      const spoofedReadings = [
        115, 115, 114, 115, 115, 115, 114, 115, 115, 114,
        115, 115, 115, 114, 115, 115, 114, 115, 115, 115,
      ];
      const stdDev = calculateStandardDeviation(spoofedReadings);
      expect(stdDev).toBeLessThan(3);
      expect(isUniformMoisture(spoofedReadings, 20, 3)).toBe(true);
    });

    it("does not flag natural variance (std dev >= 0.3 points)", () => {
      // Realistic varying loads: 10.5%, 11.8%, 13.2%, 12.0%, etc.
      const naturalReadings = [
        105, 118, 132, 120, 110, 125, 140, 115, 108, 122,
        135, 112, 128, 116, 121, 130, 114, 127, 119, 123,
      ];
      const stdDev = calculateStandardDeviation(naturalReadings);
      expect(stdDev).toBeGreaterThanOrEqual(3);
      expect(isUniformMoisture(naturalReadings, 20, 3)).toBe(false);
    });
  });

  describe("CLOCK_SKEW Flag Rule", () => {
    const serverTime = new Date("2026-11-06T12:00:00Z");

    it("does not flag when client time is within 6 hours", () => {
      const clientTime = new Date("2026-11-06T09:00:00Z"); // 3 hours difference
      expect(isClockSkewed(clientTime, serverTime, 6)).toBe(false);
    });

    it("flags when client time is more than 6 hours off (e.g. 1 day ago)", () => {
      const clientTime = new Date("2026-11-05T12:00:00Z"); // 24 hours difference
      expect(isClockSkewed(clientTime, serverTime, 6)).toBe(true);
    });

    it("flags when client clock is skewed into the future (>6 hours)", () => {
      const clientTime = new Date("2026-11-06T20:00:00Z"); // 8 hours in future
      expect(isClockSkewed(clientTime, serverTime, 6)).toBe(true);
    });
  });
});

