import { describe, it, expect } from "vitest";
import { formatSlipText } from "../slip.js";

describe("Phase 3: Marathi Slip Formatter (§11)", () => {
  it("formats C07-24518 Sunil Jadhav Soybean correctly", () => {
    const text = formatSlipText({
      slipNo: "C07-24518",
      farmerName: "सुनील जाधव",
      crop: "सोयाबीन",
      netKg: "1232.0",
      moisturePercent: "11.5",
      ratePerQuintal: 4850,
      amountFormatted: "₹59,752.00",
    });

    const expected = [
      "पावती C07-24518",
      "सुनील जाधव | सोयाबीन",
      "निव्वळ वजन: 1232.0 किग्रॅ",
      "ओलावा: 11.5%",
      "दर: ₹4,850 प्रति क्विंटल",
      "रक्कम: ₹59,752.00",
      "48 तासांत पैसे जमा होतील",
    ].join("\n");

    expect(text).toBe(expected);
  });

  it("formats C07-24519 Kamal Shinde Soybean correctly", () => {
    const text = formatSlipText({
      slipNo: "C07-24519",
      farmerName: "कमल शिंदे",
      crop: "सोयाबीन",
      netKg: "831.0",
      moisturePercent: "14.0",
      ratePerQuintal: 4850,
      amountFormatted: "₹40,303.50",
    });

    const expected = [
      "पावती C07-24519",
      "कमल शिंदे | सोयाबीन",
      "निव्वळ वजन: 831.0 किग्रॅ",
      "ओलावा: 14.0%",
      "दर: ₹4,850 प्रति क्विंटल",
      "रक्कम: ₹40,303.50",
      "48 तासांत पैसे जमा होतील",
    ].join("\n");

    expect(text).toBe(expected);
  });
});

