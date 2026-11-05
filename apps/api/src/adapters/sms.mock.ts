import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { formatSlipText, SlipDetails } from "@procurement/shared";

export function maskMobile(mobile: string): string {
  const clean = mobile.replace(/\D/g, "");
  if (clean.length < 10) return "••••••••••";
  // DPDP Act 2023 compliant mobile masking: show first 4 and last 2 digits
  return `${clean.slice(0, 4)}****${clean.slice(-2)}`;
}

export interface SendSmsParams {
  purchaseId: string;
  mobile: string;
  slip: SlipDetails;
}

export async function sendSlipSms(params: SendSmsParams) {
  const body = formatSlipText(params.slip);
  const id = `sms-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const toMobileMasked = maskMobile(params.mobile);

  const [record] = await db
    .insert(schema.smsLog)
    .values({
      id,
      purchaseId: params.purchaseId,
      toMobileMasked,
      body,
      status: "sent",
      sentAt: new Date(),
    })
    .returning();

  return record;
}

