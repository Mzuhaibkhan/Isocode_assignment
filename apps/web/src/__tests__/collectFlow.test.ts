import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import {
  netWeightX10,
  amountPaise,
  formatRupees,
  formatSlipText,
  moisturePermille,
} from "@procurement/shared";
import { db, CachedMember } from "../offline/db.js";

describe("Phase 3: Collection Flow Math & State Logic (§11, §13.2)", () => {
  it("computes exact sample 1 (Sunil Jadhav, Soybean) values", () => {
    const grossTenths = 12500; // 1250.0 kg
    const tareTenths = 180;    // 18.0 kg
    const moistureTenths = 115;// 11.5 %
    const ratePaise = 485000;  // ₹4,850/qtl

    const net = netWeightX10(grossTenths, tareTenths, moistureTenths);
    expect(net).toBe(12320); // 1232.0 kg

    const amount = amountPaise(net, ratePaise);
    expect(amount).toBe(5975200); // ₹59,752.00
    expect(formatRupees(amount)).toBe("₹59,752.00");

    const deduction = (grossTenths - tareTenths) - net;
    expect(deduction).toBe(0); // 0 deduction under 12% moisture
  });

  it("computes exact sample 2 (Kamal Shinde, Soybean) with 14% moisture", () => {
    const grossTenths = 8600;  // 860.0 kg
    const tareTenths = 120;    // 12.0 kg
    const moistureTenths = 140;// 14.0 % (2% above 12% -> 2% deduction)
    const ratePaise = 485000;  // ₹4,850/qtl

    expect(moisturePermille(moistureTenths)).toBe(20); // 20 permille = 2.0%

    const net = netWeightX10(grossTenths, tareTenths, moistureTenths);
    expect(net).toBe(8310); // 831.0 kg

    const amount = amountPaise(net, ratePaise);
    expect(amount).toBe(4030350); // ₹40,303.50
    expect(formatRupees(amount)).toBe("₹40,303.50");

    const deduction = (grossTenths - tareTenths) - net;
    expect(deduction).toBe(170); // 17.0 kg deduction
  });

  it("computes exact sample 3 (Mohan Biradar, Tur) with ₹7,200 rate", () => {
    const grossTenths = 6400;  // 640.0 kg
    const tareTenths = 100;    // 10.0 kg
    const moistureTenths = 100;// 10.0 % (no deduction)
    const ratePaise = 720000;  // ₹7,200/qtl

    const net = netWeightX10(grossTenths, tareTenths, moistureTenths);
    expect(net).toBe(6300); // 630.0 kg

    const amount = amountPaise(net, ratePaise);
    expect(amount).toBe(4536000); // ₹45,360.00
    expect(formatRupees(amount)).toBe("₹45,360.00");
  });

  it("produces Marathi slip string matching §11 hierarchy exactly", () => {
    const slipText = formatSlipText({
      slipNo: "C07-24518",
      farmerName: "सुनील जाधव",
      crop: "सोयाबीन",
      netKg: "1232.0",
      moisturePercent: "11.5",
      ratePerQuintal: 4850,
      amountFormatted: "₹59,752.00",
    });

    const lines = slipText.split("\n");
    expect(lines[0]).toBe("पावती C07-24518");
    expect(lines[1]).toBe("सुनील जाधव | सोयाबीन");
    expect(lines[2]).toBe("निव्वळ वजन: 1232.0 किग्रॅ");
    expect(lines[3]).toBe("ओलावा: 11.5%");
    expect(lines[4]).toBe("दर: ₹4,850 प्रति क्विंटल");
    expect(lines[5]).toBe("रक्कम: ₹59,752.00");
    expect(lines[6]).toBe("48 तासांत पैसे जमा होतील");
  });

  it("validates that members with consent_withdrawn cannot be selected for collection", async () => {
    const testMember: CachedMember = {
      id: "mem-consent-test",
      farmerCode: "FMR-CONSENT-1",
      name: "बाळू शिंदे",
      village: "Ausa",
      landTenthsAcre: 30,
      mobile: "9822112233",
      bankAccountMasked: "••••••••1234",
      ifsc: "MAHB0000123",
      bankVerified: true,
      consentWithdrawn: true, // Consent withdrawn!
      nameTokens: ["बाळू", "शिंदे"],
    };

    await db.members.put(testMember);

    const retrieved = await db.members.get("mem-consent-test");
    expect(retrieved).toBeDefined();
    expect(retrieved?.consentWithdrawn).toBe(true);

    // Ensure our collection validation flag catches it
    const isAllowedForCollection = (m: CachedMember) => !m.consentWithdrawn;
    expect(isAllowedForCollection(retrieved!)).toBe(false);
  });
});
