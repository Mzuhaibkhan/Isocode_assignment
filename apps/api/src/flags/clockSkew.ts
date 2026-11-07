/**
 * CLOCK_SKEW Flag Rule (§10.1)
 * client_time differs from server time by more than 6 hours.
 */

export function isClockSkewed(
  clientTime: Date,
  serverTime: Date,
  maxSkewHours = 6
): boolean {
  const maxSkewMs = maxSkewHours * 3600 * 1000;
  const diffMs = Math.abs(serverTime.getTime() - clientTime.getTime());
  return diffMs > maxSkewMs;
}

