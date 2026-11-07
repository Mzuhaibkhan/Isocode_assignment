/**
 * UNIFORM_MOISTURE Flag Rule (§10.1)
 * Last 20 readings at a centre have standard deviation below 0.3 points (3 tenths).
 * Used to catch moisture meter spoofing or stuck/broken sensor pins.
 */

export function calculateStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance =
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

export function isUniformMoisture(
  recentMoistureX10: number[],
  minReadings = 20,
  thresholdStdDevX10 = 3 // 0.3% is 3 tenths of a percent
): boolean {
  if (recentMoistureX10.length < minReadings) {
    return false;
  }

  // Take the most recent minReadings
  const windowValues = recentMoistureX10.slice(0, minReadings);
  const stdDev = calculateStandardDeviation(windowValues);

  return stdDev < thresholdStdDevX10;
}

