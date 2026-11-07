/**
 * DUPLICATE_FARMER Flag Rule (§10.1)
 * Same member has another purchase within 60 minutes at any centre.
 */

export function isDuplicateFarmerTime(
  currentPurchaseTime: Date,
  priorPurchaseTimes: Date[],
  windowMinutes = 60
): boolean {
  const currentMs = currentPurchaseTime.getTime();
  const windowMs = windowMinutes * 60 * 1000;

  for (const priorTime of priorPurchaseTimes) {
    const diff = Math.abs(currentMs - priorTime.getTime());
    if (diff <= windowMs) {
      return true;
    }
  }

  return false;
}

