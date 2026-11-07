export * from "./duplicateFarmer.js";
export * from "./yieldCheck.js";
export * from "./uniformMoisture.js";
export * from "./clockSkew.js";

import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { SyncHoldReason, type SyncHoldReasonType } from "@procurement/shared";
import { isDuplicateFarmerTime } from "./duplicateFarmer.js";
import { isYieldHigh } from "./yieldCheck.js";
import { isUniformMoisture } from "./uniformMoisture.js";
import { isClockSkewed } from "./clockSkew.js";

export interface EvaluationInput {
  memberId: string;
  centreId: string;
  crop: string;
  netX10: number;
  moistureX10: number;
  clientTime: Date;
  serverTime: Date;
  priceVersion: number;
  ratePaise: number;
  activePriceVersion?: number;
  consentWithdrawnAt?: Date | null;
  excludePurchaseId?: string;
}

/**
 * Runs all §10.1 flag rules against an incoming purchase and returns
 * any hold reasons triggered.
 */
export async function evaluatePurchaseFlags(
  input: EvaluationInput
): Promise<SyncHoldReasonType[]> {
  const flags: SyncHoldReasonType[] = [];

  // 1. CLOCK_SKEW Check
  if (isClockSkewed(input.clientTime, input.serverTime)) {
    flags.push(SyncHoldReason.CLOCK_SKEW);
  }

  // 2. CONSENT_WITHDRAWN Check
  if (
    input.consentWithdrawnAt &&
    new Date(input.consentWithdrawnAt) <= input.clientTime
  ) {
    flags.push(SyncHoldReason.CONSENT_WITHDRAWN);
  }

  // 3. STALE_PRICE_VERSION Check
  if (
    input.activePriceVersion !== undefined &&
    input.priceVersion < input.activePriceVersion
  ) {
    flags.push(SyncHoldReason.STALE_PRICE_VERSION);
  }

  // 4. DUPLICATE_FARMER Check (Another purchase for member within 60 minutes)
  try {
    const priorPurchases = await db
      .select({
        clientTime: schema.purchases.clientTime,
      })
      .from(schema.purchases)
      .where(
        input.excludePurchaseId
          ? and(
              eq(schema.purchases.memberId, input.memberId),
              sql`${schema.purchases.id} != ${input.excludePurchaseId}`
            )
          : eq(schema.purchases.memberId, input.memberId)
      )
      .orderBy(desc(schema.purchases.clientTime))
      .limit(10);

    const priorTimes = priorPurchases.map((p) => new Date(p.clientTime));
    if (isDuplicateFarmerTime(input.clientTime, priorTimes, 60)) {
      flags.push(SyncHoldReason.DUPLICATE_FARMER);
    }
  } catch (err) {
    console.warn("Could not query prior purchases for duplicate check:", err);
  }

  // 5. YIELD_HIGH Check
  try {
    const [member] = await db
      .select({ landTenthsAcre: schema.members.landTenthsAcre })
      .from(schema.members)
      .where(eq(schema.members.id, input.memberId))
      .limit(1);

    if (member) {
      const priorSeason = await db
        .select({
          totalNet: sql<number>`coalesce(sum(${schema.purchases.netX10}), 0)`,
        })
        .from(schema.purchases)
        .where(
          and(
            eq(schema.purchases.memberId, input.memberId),
            eq(schema.purchases.crop, input.crop)
          )
        );

      const priorNetX10 = Number(priorSeason[0]?.totalNet || 0);
      if (
        isYieldHigh(
          member.landTenthsAcre,
          priorNetX10,
          input.netX10,
          input.crop
        )
      ) {
        flags.push(SyncHoldReason.YIELD_HIGH);
      }
    }
  } catch (err) {
    console.warn("Could not evaluate yield check:", err);
  }

  // 6. UNIFORM_MOISTURE Check (Last 20 readings at this centre)
  try {
    const centreDevices = await db
      .select({ id: schema.devices.id })
      .from(schema.devices)
      .where(eq(schema.devices.centreId, input.centreId));

    if (centreDevices.length > 0) {
      const deviceIds = centreDevices.map((d) => d.id);
      const recentPurchases = await db
        .select({ moistureX10: schema.purchases.moistureX10 })
        .from(schema.purchases)
        .where(sql`${schema.purchases.deviceId} in ${deviceIds}`)
        .orderBy(desc(schema.purchases.serverReceivedAt))
        .limit(20);

      const moistures = [
        input.moistureX10,
        ...recentPurchases.map((p) => p.moistureX10),
      ];

      if (isUniformMoisture(moistures, 20, 3)) {
        flags.push(SyncHoldReason.UNIFORM_MOISTURE);
      }
    }
  } catch (err) {
    console.warn("Could not evaluate uniform moisture:", err);
  }

  return flags;
}

