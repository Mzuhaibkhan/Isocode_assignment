import Dexie, { type Table } from "dexie";

export interface OutboxEntry {
  id: string; // UUID
  seq: number; // device_seq, strictly increasing
  payload: Record<string, unknown>;
  prevHash: string;
  entryHash: string;
  signature: string; // base64
  status: "pending" | "synced" | "rejected";
  reason?: string;
}

export interface CachedMember {
  id: string;
  farmerCode: string;
  name: string;
  nameLatin?: string;
  village: string;
  landTenthsAcre: number;
  mobile: string;
  bankAccountMasked: string;
  ifsc: string;
  bankVerified: boolean;
  consentWithdrawn: boolean;
  nameTokens: string[]; // multiEntry tokens for fast surname/first name search
}

export interface CachedPrice {
  id: string;
  crop: string;
  grade: string;
  ratePaisePerQuintal: number;
  rateRupees: number;
  rateFormatted: string;
  version: number;
  effectiveFrom: string;
}

export interface QueuedPhoto {
  id: string;
  purchaseId?: string;
  kind: "scale" | "meter";
  imageData: string;
  aiValueX10?: number | null;
  typedValueX10: number;
  matched: boolean;
  aiNote?: string;
  createdAt: string;
  status: "pending" | "uploaded";
}

// The verified operator/office identity stored after a successful online login.
// Offline unlock is only allowed while this record is fresh (§ auth hardening).
export interface ActiveUserRecord {
  id: string;
  role: "operator" | "office_manager";
  name: string;
  centreId?: string | null;
  centreCode?: string | null;
  authAt: string;
}

// How long an offline operator unlock stays valid after the last online login.
const OFFLINE_UNLOCK_HOURS = 48;

export async function saveActiveUser(user: ActiveUserRecord): Promise<void> {
  await db.meta.put({ key: "activeUser", value: user });
}

export async function getActiveUser(): Promise<ActiveUserRecord | undefined> {
  return (await db.meta.get("activeUser"))?.value as ActiveUserRecord | undefined;
}

export function isOfflineUnlockValid(user: ActiveUserRecord): boolean {
  const authAt = new Date(user.authAt).getTime();
  return Date.now() - authAt <= OFFLINE_UNLOCK_HOURS * 60 * 60 * 1000;
}

export function buildNameTokens(name: string, nameLatin?: string): string[] {
  const tokens = new Set<string>();

  // Devanagari NFC normalisation
  const normalizedDev = name.normalize("NFC").trim();
  const words = normalizedDev.split(/\s+/);
  for (const w of words) {
    if (w) tokens.add(w.toLowerCase());
  }

  // Also include Latin tokens if provided (e.g. "Sunil", "Jadhav")
  if (nameLatin) {
    const latWords = nameLatin.toLowerCase().trim().split(/\s+/);
    for (const lw of latWords) {
      if (lw) tokens.add(lw);
    }
  }

  return Array.from(tokens);
}

export class AppDB extends Dexie {
  outbox!: Table<OutboxEntry, string>;
  members!: Table<CachedMember, string>;
  prices!: Table<CachedPrice, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  photos!: Table<QueuedPhoto, string>;

  constructor() {
    super("procurement_db");
    this.version(1).stores({
      outbox: "id, seq, status",
      members: "id, farmerCode, village, *nameTokens", // * = multiEntry index on tokens
      prices: "id, crop, grade, version",
      meta: "key",
    });
    this.version(2).stores({
      outbox: "id, seq, status",
      members: "id, farmerCode, village, *nameTokens",
      prices: "id, crop, grade, version",
      meta: "key",
      photos: "id, purchaseId, status",
    });
  }

  // Fast offline search matching token prefix, farmer code, or village
  async searchMembers(query: string, limit = 20): Promise<CachedMember[]> {
    const q = query.trim().normalize("NFC").toLowerCase();
    if (!q) {
      return this.members.limit(limit).toArray();
    }

    // 1. Search by nameTokens prefix
    const byToken = await this.members
      .where("nameTokens")
      .startsWith(q)
      .distinct()
      .limit(limit)
      .toArray();

    if (byToken.length >= limit) {
      return byToken;
    }

    // 2. Also search by farmerCode and village
    const remaining = limit - byToken.length;
    const existingIds = new Set(byToken.map((m) => m.id));

    const byCodeOrVillage = await this.members
      .filter(
        (m) =>
          !existingIds.has(m.id) &&
          (m.farmerCode.toLowerCase().startsWith(q) ||
            m.village.toLowerCase().includes(q))
      )
      .limit(remaining)
      .toArray();

    return [...byToken, ...byCodeOrVillage];
  }
}

export const db = new AppDB();

