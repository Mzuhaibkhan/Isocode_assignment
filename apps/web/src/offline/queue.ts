import { getOrCreateDeviceKey, signHash } from "./signer.js";
import { db, getActiveUser, type OutboxEntry } from "./db.js";
import {
  netWeightX10,
  amountPaise,
  formatRupees,
  entryHash,
  type SlipDetails,
} from "@procurement/shared";

export interface EnqueuePurchaseInput {
  memberId: string;
  farmerName: string;
  crop: string;
  grade: string;
  grossX10: number;
  tareX10: number;
  moistureX10: number;
  ratePaise: number;
  priceVersion: number;
  centreCode?: string;
  /** Ids of queued meter/scale photos to bind to this purchase (§10.2). */
  photoIds?: string[];
}

export interface EnqueuePurchaseResult {
  outboxEntry: OutboxEntry;
  slip: SlipDetails & {
    amountPaise: number;
    smsStatus: "sent" | "pending" | "offline";
  };
}

/**
 * Creates an immutable, signed, hash-chained purchase entry in the local outbox (§9.5).
 * Updates device sequence and lastHash atomically in a Dexie transaction.
 */
export async function enqueuePurchase(
  input: EnqueuePurchaseInput
): Promise<EnqueuePurchaseResult> {
  // 1. Consent Check (§9.5)
  const member = await db.members.get(input.memberId);
  if (member?.consentWithdrawn) {
    throw new Error(
      "या सभासदाने DPDP कायद्यांतर्गत संमती मागे घेतली आहे. खरेदी नोंदवता येणार नाही."
    );
  }

  // 2. Ensure Device Key & Sequence are ready
  const { keyPair, deviceId } = await getOrCreateDeviceKey();

  const nextSeqRecord = await db.meta.get("nextSeq");
  const deviceSeq = (nextSeqRecord?.value as number) || 1;

  const lastHashRecord = await db.meta.get("lastHash");
  const prevHash = (lastHashRecord?.value as string) || "0".repeat(64);

  // Centre identity comes from the verified login, never from a hardcoded
  // default. Callers may pass an explicit centreCode for demo/test purposes.
  const activeUser = await getActiveUser();
  const centreCode = input.centreCode || activeUser?.centreCode || null;
  if (!centreCode) {
    throw new Error("केंद्र निवडलेले नाही. आधी लॉगिन करा. (NO CENTRE SELECTED — LOGIN FIRST)");
  }

  // 3. Compute net weight and amount with shared math
  const netX10 = netWeightX10(input.grossX10, input.tareX10, input.moistureX10);
  const totalAmountPaise = amountPaise(netX10, input.ratePaise);

  const id = crypto.randomUUID();
  const clientTime = new Date().toISOString();

  // 4. Build Canonical Payload (§9.5 step 1) — slip number comes from the
  // per-centre slipCounter meta, seeded from the server's next-slip on login
  // and incremented atomically with the outbox write (§ centre identity).
  const payload = {
    id,
    memberId: input.memberId,
    crop: input.crop,
    grade: input.grade,
    grossX10: input.grossX10,
    tareX10: input.tareX10,
    moistureX10: input.moistureX10,
    netX10,
    ratePaise: input.ratePaise,
    amountPaise: totalAmountPaise,
    priceVersion: input.priceVersion,
    clientTime,
    deviceId,
    deviceSeq,
    correctsId: null,
  };

  // 5. Hash & Sign (§9.5 steps 4 & 5). The slip counter is reserved inside
  // its own Dexie transaction (Dexie-only awaits) so concurrent enqueues can
  // never print the same slip number; crypto hashing happens outside the
  // transaction to keep Dexie zone tracking reliable.
  let slipNo = "";
  await db.transaction("rw", [db.meta], async () => {
    const counterRecord = await db.meta.get(`slipCounter:${centreCode}`);
    // Fallback only for the demo/test environment when login never seeded the
    // counter (C07 continues from the seeded 24519 sample slips).
    const slipCounter =
      (counterRecord?.value as number | undefined) ?? 24520 + deviceSeq;
    slipNo = `${centreCode}-${slipCounter}`;
    await db.meta.put({ key: `slipCounter:${centreCode}`, value: slipCounter + 1 });
  });

  const signedPayload = { ...payload, slipNo };
  const computedEntryHash = await entryHash(signedPayload, prevHash);
  const signature = await signHash(keyPair.privateKey, computedEntryHash);

  const outboxEntry: OutboxEntry = {
    id,
    seq: deviceSeq,
    payload: signedPayload,
    prevHash,
    entryHash: computedEntryHash,
    signature,
    status: "pending",
  };

  // 6. Atomic Write to Dexie (§9.5 step 6) — binds the flow's queued photos
  // to this purchase so they upload after the purchase syncs (§10.2).
  await db.transaction("rw", [db.outbox, db.meta, db.photos], async () => {
    await db.outbox.put(outboxEntry);
    await db.meta.put({ key: "lastHash", value: computedEntryHash });
    await db.meta.put({ key: "nextSeq", value: deviceSeq + 1 });
    for (const photoId of input.photoIds ?? []) {
      await db.photos.update(photoId, { purchaseId: id });
    }
  });

  const cropLabelMarathi =
    input.crop === "Soybean" ? "सोयाबीन" : input.crop === "Tur" ? "तूर" : input.crop;

  const slip = {
    slipNo,
    farmerName: input.farmerName,
    crop: cropLabelMarathi,
    netKg: (netX10 / 10).toFixed(1),
    moisturePercent: (input.moistureX10 / 10).toFixed(1),
    ratePerQuintal: Math.floor(input.ratePaise / 100),
    amountPaise: totalAmountPaise,
    amountFormatted: formatRupees(totalAmountPaise),
    smsStatus: (typeof navigator === "undefined" || navigator.onLine !== false
      ? "pending"
      : "offline") as "pending" | "offline",
  };

  return { outboxEntry, slip };
}
