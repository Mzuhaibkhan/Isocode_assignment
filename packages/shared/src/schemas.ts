import { z } from "zod";
import { MAX_GROSS_X10, MAX_MOISTURE_X10 } from "./money.js";

export const LoginSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("office_manager"),
    email: z.string().email(),
    password: z.string().min(6),
  }),
  z.object({
    role: z.literal("operator"),
    centreId: z.string().min(1),
    pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits"),
    deviceId: z.string().optional(),
  }),
]);

export type LoginInput = z.infer<typeof LoginSchema>;

export const PurchaseInputSchema = z.object({
  id: z.string().uuid(),
  slipNo: z.string().min(1),
  memberId: z.string().min(1),
  crop: z.string().min(1),
  grade: z.string().min(1),
  grossX10: z.number().int().min(0).max(MAX_GROSS_X10),
  tareX10: z.number().int().min(0),
  moistureX10: z.number().int().min(0).max(MAX_MOISTURE_X10),
  netX10: z.number().int().min(0),
  ratePaise: z.number().int().min(0),
  amountPaise: z.number().int().min(0),
  priceVersion: z.number().int().min(1),
  clientTime: z.string().min(1),
  deviceId: z.string().min(1),
  deviceSeq: z.number().int().min(1),
  prevHash: z.string().length(64),
  entryHash: z.string().length(64),
  signature: z.string().min(1),
  correctsId: z.string().uuid().nullable().optional(),
});

export type PurchaseInput = z.infer<typeof PurchaseInputSchema>;

export const SyncBatchSchema = z.object({
  deviceId: z.string().min(1),
  entries: z.array(PurchaseInputSchema).min(1).max(100),
});

export type SyncBatchInput = z.infer<typeof SyncBatchSchema>;

export const DeviceRegisterSchema = z.object({
  deviceId: z.string().optional(),
  centreId: z.string().min(1),
  publicKeyJwk: z.string().min(1),
});

export type DeviceRegisterInput = z.infer<typeof DeviceRegisterSchema>;

export const MemberCreateSchema = z.object({
  farmerCode: z.string().min(1),
  name: z.string().min(1),
  nameLatin: z.string().optional(),
  village: z.string().min(1),
  landTenthsAcre: z.number().int().min(0),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Must be valid 10-digit Indian mobile number"),
  bankAccount: z.string().min(8).max(20),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Must be valid Indian IFSC code"),
  consentAt: z.string().datetime(),
  consentTextVersion: z.number().int().default(1),
});

export type MemberCreateInput = z.infer<typeof MemberCreateSchema>;

export const PriceBoardCreateSchema = z.object({
  crop: z.string().min(1),
  grade: z.string().min(1),
  ratePaisePerQuintal: z.number().int().min(1),
  effectiveFrom: z.string().datetime().optional(),
});

export type PriceBoardCreateInput = z.infer<typeof PriceBoardCreateSchema>;

