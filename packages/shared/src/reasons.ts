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

export const SYNC_REASON_LABELS_MR: Record<string, string> = {
  SIGNATURE_INVALID: "स्वाक्षरी अवैध (अनाधिकृत साधन)",
  HASH_MISMATCH: "माहिती बदललेली आढळली (हॅश जुळत नाही)",
  PREV_HASH_MISMATCH: "साखळी तुटलेली आढळली (मागील हॅश विसंगत)",
  SEQ_GAP: "क्रमांक विसंगती (क्रम चुकलेला आहे)",
  CALCULATION_MISMATCH: "वजन किंवा रक्कम हिशोबात फरक",
  RATE_MISMATCH: "दर विसंगती (अधिकृत दराशी जुळत नाही)",
  DEVICE_REVOKED: "हे साधन रद्द करण्यात आले आहे",
  STALE_PRICE_VERSION: "जुन्या दरानुसार नोंद (पुनरावलोकन प्रलंबित)",
  DUPLICATE_FARMER: "एकाच दिवशी एकाच शेतकऱ्याची दुबार नोंद",
  YIELD_HIGH: "जमिनीच्या क्षमतेपेक्षा जास्त उत्पन्न (संशयास्पद)",
  UNIFORM_MOISTURE: "सलग नोंदींमध्ये एकच ओलावा आढळला",
  CLOCK_SKEW: "घड्याळ विसंगती (वेळेत ६ तासांपेक्षा जास्त फरक)",
  CONSENT_WITHDRAWN: "संमती मागे घेतलेली नोंद (पुनरावलोकन प्रलंबित)",
};


