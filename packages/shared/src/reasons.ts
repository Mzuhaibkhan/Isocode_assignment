export const SyncRejectionReason = {
  SIGNATURE_INVALID: "SIGNATURE_INVALID",
  HASH_MISMATCH: "HASH_MISMATCH",
  PREV_HASH_MISMATCH: "PREV_HASH_MISMATCH",
  SEQ_GAP: "SEQ_GAP",
  CALCULATION_MISMATCH: "CALCULATION_MISMATCH",
  RATE_MISMATCH: "RATE_MISMATCH",
  DEVICE_REVOKED: "DEVICE_REVOKED",
} as const;

export type SyncRejectionReasonType =
  (typeof SyncRejectionReason)[keyof typeof SyncRejectionReason];

export const SyncHoldReason = {
  STALE_PRICE_VERSION: "STALE_PRICE_VERSION",
  DUPLICATE_FARMER: "DUPLICATE_FARMER",
  YIELD_HIGH: "YIELD_HIGH",
  UNIFORM_MOISTURE: "UNIFORM_MOISTURE",
  CLOCK_SKEW: "CLOCK_SKEW",
  CONSENT_WITHDRAWN: "CONSENT_WITHDRAWN",
} as const;

export type SyncHoldReasonType =
  (typeof SyncHoldReason)[keyof typeof SyncHoldReason];

