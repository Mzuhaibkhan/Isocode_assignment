import { describe, it, expect } from "vitest";
import {
  netWeightX10,
  amountPaise,
  formatRupees,
  moisturePermille,
  BASE_MOISTURE_X10,
} from "../money.js";

describe("Money and Moisture Rules (§6)", () => {
  it("computes sample slip C07-24518 correctly", () => {
    // Sunil Jadhav, Soybean: gross 1250.0kg, tare 18.0kg, moisture 11.5%, rate 4850
    const net = netWeightX10(12500, 180, 115);
    expect(net).toBe(12320); // 1232.0 kg
    const amount = amountPaise(net, 485000);
    expect(amount).toBe(5975200); // Rs 59,752.00
    expect(formatRupees(amount)).toBe("₹59,752.00");
  });

  it("computes sample slip C07-24519 correctly", () => {
    // Kamal Shinde, Soybean: gross 860.0kg, tare 12.0kg, moisture 14.0%, rate 4850
    const net = netWeightX10(8600, 120, 140);
    expect(net).toBe(8310); // 831.0 kg (2.0% deduction on 848.0kg = 16.96kg deduction -> 831.04kg -> 831.0kg)
    const amount = amountPaise(net, 485000);
    expect(amount).toBe(4030350); // Rs 40,303.50
    expect(formatRupees(amount)).toBe("₹40,303.50");
  });

  it("computes sample slip C12-08876 correctly", () => {
    // Mohan Biradar, Tur: gross 640.0kg, tare 10.0kg, moisture 10.0%, rate 7200
    const net = netWeightX10(6400, 100, 100);
    expect(net).toBe(6300); // 630.0 kg (no deduction for moisture <= 12%)
    const amount = amountPaise(net, 720000);
    expect(amount).toBe(4536000); // Rs 45,360.00
    expect(formatRupees(amount)).toBe("₹45,360.00");
  });

  it("handles moisture exactly 12.0% (no deduction)", () => {
    const net = netWeightX10(10000, 0, 120);
    expect(net).toBe(10000);
    const amount = amountPaise(net, 485000);
    expect(amount).toBe(4850000);
    expect(formatRupees(amount)).toBe("₹48,500.00");
  });

  it("handles fractional moisture 12.1% (0.1 point deduction)", () => {
    const net = netWeightX10(10000, 0, 121);
    expect(net).toBe(9990);
    const amount = amountPaise(net, 485000);
    expect(amount).toBe(4845150);
    expect(formatRupees(amount)).toBe("₹48,451.50");
  });

  it("handles fractional moisture 13.5% (1.5 point deduction)", () => {
    const net = netWeightX10(10000, 0, 135);
    expect(net).toBe(9850);
    const amount = amountPaise(net, 485000);
    expect(amount).toBe(4777250);
    expect(formatRupees(amount)).toBe("₹47,772.50");
  });

  it("handles moisture 20.0% (8.0 points deduction)", () => {
    const net = netWeightX10(10000, 0, 200);
    expect(net).toBe(9200);
    const amount = amountPaise(net, 485000);
    expect(amount).toBe(4462000);
    expect(formatRupees(amount)).toBe("₹44,620.00");
  });

  it("handles moisture 30.0% (18.0 points deduction)", () => {
    const net = netWeightX10(10000, 0, 300);
    expect(net).toBe(8200);
    const amount = amountPaise(net, 485000);
    expect(amount).toBe(3977000);
    expect(formatRupees(amount)).toBe("₹39,770.00");
  });

  it("rounds half up for net weight (499.5 rounds to 500)", () => {
    // 500 * (1000 - 1) / 1000 = 499.5 -> rounds half up to 500
    const net = netWeightX10(500, 0, 121);
    expect(net).toBe(500);
    const amount = amountPaise(net, 485000);
    expect(amount).toBe(242500);
    expect(formatRupees(amount)).toBe("₹2,425.00");
  });

  it("rounds half up for amount (0.5 paise rounds to 1)", () => {
    // net = 1, rate = 500 -> 1 * 500 / 1000 = 0.5 -> 1 paise
    const amount = amountPaise(1, 500);
    expect(amount).toBe(1);
    expect(formatRupees(amount)).toBe("₹0.01");
  });

  it("handles tare equals gross (zero net)", () => {
    const net = netWeightX10(100, 100, 120);
    expect(net).toBe(0);
    const amount = amountPaise(net, 485000);
    expect(amount).toBe(0);
    expect(formatRupees(amount)).toBe("₹0.00");
  });

  it("throws when tare exceeds gross", () => {
    expect(() => netWeightX10(100, 200, 120)).toThrow("Tare exceeds gross");
  });

  it("throws when moisture exceeds 50.0%", () => {
    expect(() => netWeightX10(10000, 0, 501)).toThrow("Input out of range");
  });

  it("throws when gross exceeds 50,000.0 kg", () => {
    expect(() => netWeightX10(500001, 0, 100)).toThrow("Input out of range");
  });

  it("throws when inputs are non-integers", () => {
    expect(() => netWeightX10(100.5, 0, 120)).toThrow("Inputs must be integers");
  });

  describe("formatRupees formatting", () => {
    it("formats 5975200 paise correctly", () => {
      expect(formatRupees(5975200)).toBe("₹59,752.00");
    });

    it("formats 4030350 paise correctly", () => {
      expect(formatRupees(4030350)).toBe("₹40,303.50");
    });

    it("formats 5 paise correctly", () => {
      expect(formatRupees(5)).toBe("₹0.05");
    });

    it("formats 1,00,000 rupees (10,000,000 paise) with Indian numbering grouping", () => {
      expect(formatRupees(10000000)).toBe("₹1,00,000.00");
    });
  });
});

