export const BASE_MOISTURE_X10 = 120;
export const MAX_GROSS_X10 = 500_000;   // 50,000.0 kg
export const MAX_MOISTURE_X10 = 500;    // 50.0 %

// Safe-integer note: before * 1000 <= ~1.5e8 and net * rate <= ~1e11 for realistic loads.
// IEEE-754 doubles are exact for integers up to 2^53, so no BigInt is needed.
export const roundDiv = (n: number, d: number) => Math.floor((2 * n + d) / (2 * d)); // half up, n >= 0

export function moisturePermille(moistureX10: number): number {
  return Math.min(1000, Math.max(0, moistureX10 - BASE_MOISTURE_X10));
}

export function netWeightX10(grossX10: number, tareX10: number, moistureX10: number): number {
  if (!Number.isInteger(grossX10) || !Number.isInteger(tareX10) || !Number.isInteger(moistureX10)) {
    throw new Error("Inputs must be integers");
  }
  if (grossX10 > MAX_GROSS_X10 || moistureX10 > MAX_MOISTURE_X10 || moistureX10 < 0) {
    throw new Error("Input out of range");
  }
  const before = grossX10 - tareX10;
  if (before < 0) {
    throw new Error("Tare exceeds gross");
  }
  return roundDiv(before * (1000 - moisturePermille(moistureX10)), 1000);
}

export function amountPaise(netX10: number, ratePaisePerQuintal: number): number {
  return roundDiv(netX10 * ratePaisePerQuintal, 1000);
}

export function formatRupees(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const p = String(paise % 100).padStart(2, "0");
  return "₹" + rupees.toLocaleString("en-IN") + "." + p;
}

