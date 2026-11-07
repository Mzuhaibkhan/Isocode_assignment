/**
 * YIELD_HIGH Flag Rule (§10.1)
 * Season net weight exceeds land acres × max yield per acre
 * (default 1,200 kg per acre for soybean, 800 kg per acre for tur, configurable).
 *
 * Values are stored in integer tenths of a kg:
 * landTenthsAcre: 50 -> 5.0 acres
 * maxYieldKgPerAcre: 1200 kg -> 12000 tenths of kg
 * maxAllowedNetX10 = (landTenthsAcre / 10) * maxYieldKgPerAcre * 10 = landTenthsAcre * maxYieldKgPerAcre
 */

export const DEFAULT_MAX_YIELD_KG_PER_ACRE: Record<string, number> = {
  Soybean: 1200,
  Tur: 800,
};

export function isYieldHigh(
  landTenthsAcre: number,
  priorSeasonNetX10: number,
  currentNetX10: number,
  crop = "Soybean",
  customMaxYieldKgPerAcre?: number
): boolean {
  if (landTenthsAcre <= 0) {
    // If farmer has 0 registered land acres, any delivery exceeds quota
    return true;
  }

  const maxYieldKg =
    customMaxYieldKgPerAcre ??
    DEFAULT_MAX_YIELD_KG_PER_ACRE[crop] ??
    1200;

  // Max allowed tenths of kg = (landTenthsAcre / 10) * (maxYieldKg * 10) = landTenthsAcre * maxYieldKg
  const maxAllowedNetX10 = landTenthsAcre * maxYieldKg;
  const totalSeasonNetX10 = priorSeasonNetX10 + currentNetX10;

  return totalSeasonNetX10 > maxAllowedNetX10;
}

