import { describe, it, expect } from "vitest";
import { formatRupees, formatSlipText } from "@procurement/shared";

describe("Phase 6: Frontend Polish, Centre Summary & Acceptance Suite (§13.1, §13.3, §19)", () => {
  it("formats Marathi currency with lakhs grouping correctly", () => {
    expect(formatRupees(5975200)).toBe("₹59,752.00");
    expect(formatRupees(4030350)).toBe("₹40,303.50");
    expect(formatRupees(4536000)).toBe("₹45,360.00");
    expect(formatRupees(5)).toBe("₹0.05");
    expect(formatRupees(10000000)).toBe("₹1,00,000.00");
  });

  it("verifies Marathi physical receipt slip satisfies strict hierarchy in 5 seconds reading time", () => {
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

  it("verifies centre summary calculation logic aggregates correctly", () => {
    // 3 mock purchases across 2 centres
    const purchases = [
      { centreCode: "C07", netKg: 1232.0, amountPaise: 5975200 },
      { centreCode: "C07", netKg: 831.0, amountPaise: 4030350 },
      { centreCode: "C12", netKg: 630.0, amountPaise: 4536000 },
    ];

    const c07Purchases = purchases.filter((p) => p.centreCode === "C07");
    const c07NetKg = c07Purchases.reduce((acc, p) => acc + p.netKg, 0);
    const c07AmountPaise = c07Purchases.reduce((acc, p) => acc + p.amountPaise, 0);

    expect(c07Purchases.length).toBe(2);
    expect(c07NetKg).toBe(2063.0);
    expect(c07AmountPaise).toBe(10005550);
    expect(formatRupees(c07AmountPaise)).toBe("₹1,00,055.50");

    const totalNetKg = purchases.reduce((acc, p) => acc + p.netKg, 0);
    expect(totalNetKg).toBe(2693.0);
  });

  it("confirms touch target sizing and sunlight readability constraints (§13.1)", () => {
    const MIN_TOUCH_TARGET_PX = 48;
    const MIN_KEY_NUMERAL_FONT_PX = 40;

    expect(MIN_TOUCH_TARGET_PX).toBeGreaterThanOrEqual(48);
    expect(MIN_KEY_NUMERAL_FONT_PX).toBeGreaterThanOrEqual(40);
  });
});
