import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  uniqueIndex,
  check,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const centres = pgTable("centres", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(), // e.g. C07
  name: text("name").notNull(),
  village: text("village").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  role: text("role").notNull(), // 'operator' | 'office_manager'
  centreId: text("centre_id").references(() => centres.id),
  name: text("name").notNull(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  pinHash: text("pin_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const devices = pgTable("devices", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  centreId: text("centre_id").references(() => centres.id).notNull(),
  publicKeyJwk: text("public_key_jwk").notNull(),
  registeredAt: timestamp("registered_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by").references(() => users.id),
  revocationReason: text("revocation_reason"),
});

export const members = pgTable("members", {
  id: text("id").primaryKey(),
  farmerCode: text("farmer_code").notNull().unique(),
  name: text("name").notNull(),
  nameLatin: text("name_latin"),
  village: text("village").notNull(),
  centreId: text("centre_id").references(() => centres.id),
  landTenthsAcre: integer("land_tenths_acre").notNull(),
  mobile: text("mobile").notNull(),
  bankAccountEnc: text("bank_account_enc").notNull(),
  ifsc: text("ifsc").notNull(),
  bankVerifiedAt: timestamp("bank_verified_at", { withTimezone: true }),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  consentTextVersion: integer("consent_text_version").default(1).notNull(),
  consentWithdrawnAt: timestamp("consent_withdrawn_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const priceBoard = pgTable("price_board", {
  id: text("id").primaryKey(),
  crop: text("crop").notNull(),
  grade: text("grade").notNull(),
  ratePaisePerQuintal: integer("rate_paise_per_quintal").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).defaultNow().notNull(),
  version: integer("version").notNull(),
  setBy: text("set_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const moistureRules = pgTable("moisture_rules", {
  id: text("id").primaryKey(),
  crop: text("crop").notNull().unique(),
  baseMoistureX10: integer("base_moisture_x10").default(120).notNull(),
  deductionPermillePerPoint: integer("deduction_permille_per_point").default(10).notNull(),
});

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey(),
    slipNo: text("slip_no").notNull().unique(),
    memberId: text("member_id").references(() => members.id).notNull(),
    crop: text("crop").notNull(),
    grade: text("grade").notNull(),
    grossX10: integer("gross_x10").notNull(),
    tareX10: integer("tare_x10").notNull(),
    moistureX10: integer("moisture_x10").notNull(),
    netX10: integer("net_x10").notNull(),
    ratePaise: integer("rate_paise").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    priceVersion: integer("price_version").notNull(),
    memberSnapshotJson: text("member_snapshot_json").notNull(), // encrypted
    deviceId: text("device_id").references(() => devices.id).notNull(),
    deviceSeq: integer("device_seq").notNull(),
    prevHash: text("prev_hash").notNull(),
    entryHash: text("entry_hash").notNull(),
    signature: text("signature").notNull(),
    correctsId: uuid("corrects_id"),
    clientTime: timestamp("client_time", { withTimezone: true }).notNull(),
    serverReceivedAt: timestamp("server_received_at", { withTimezone: true }).defaultNow().notNull(),
    status: text("status").notNull(), // 'accepted' | 'held' | 'approved' | 'in_payment' | 'paid'
    flagCodes: text("flag_codes").array(),
  },
  (table) => [
    uniqueIndex("device_seq_idx").on(table.deviceId, table.deviceSeq),
    check("net_non_negative", sql`${table.netX10} >= 0`),
    check("amount_non_negative", sql`${table.amountPaise} >= 0`),
  ]
);

export const purchasePhotos = pgTable("purchase_photos", {
  id: text("id").primaryKey(),
  purchaseId: uuid("purchase_id").references(() => purchases.id).notNull(),
  kind: text("kind").notNull(), // 'scale' | 'meter'
  storageKey: text("storage_key").notNull(),
  aiValueX10: integer("ai_value_x10"),
  typedValueX10: integer("typed_value_x10").notNull(),
  matched: boolean("matched").notNull(),
  aiNote: text("ai_note"),
  imageData: text("image_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const syncRejections = pgTable("sync_rejections", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").references(() => devices.id).notNull(),
  deviceSeq: integer("device_seq").notNull(),
  reason: text("reason").notNull(),
  payloadHash: text("payload_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const paymentRuns = pgTable("payment_runs", {
  id: text("id").primaryKey(),
  createdBy: text("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  totalPaise: integer("total_paise").notNull(),
  fileKey: text("file_key").notNull(),
  fileContent: text("file_content"),
  kind: text("kind").default("original").notNull(), // 'original' | 'retry'
  parentRunId: text("parent_run_id"),
  status: text("status").default("created").notNull(),
});

export const paymentItems = pgTable("payment_items", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => paymentRuns.id).notNull(),
  memberId: text("member_id").references(() => members.id).notNull(),
  purchaseIds: text("purchase_ids").array().notNull(),
  amountPaise: integer("amount_paise").notNull(),
  status: text("status").default("queued").notNull(), // 'queued' | 'sent' | 'success' | 'failed'
  bankRef: text("bank_ref"),
  retryOfItemId: text("retry_of_item_id"),
  retriedByItemId: text("retried_by_item_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const smsLog = pgTable("sms_log", {
  id: text("id").primaryKey(),
  purchaseId: uuid("purchase_id").references(() => purchases.id).notNull(),
  toMobileMasked: text("to_mobile_masked").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull(), // 'pending' | 'sent' | 'failed'
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => users.id).notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  metaJson: text("meta_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

