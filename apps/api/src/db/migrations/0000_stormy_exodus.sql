CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"meta_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centres" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"village" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "centres_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"centre_id" text NOT NULL,
	"public_key_jwk" text NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"revocation_reason" text
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"farmer_code" text NOT NULL,
	"name" text NOT NULL,
	"name_latin" text,
	"village" text NOT NULL,
	"land_tenths_acre" integer NOT NULL,
	"mobile" text NOT NULL,
	"bank_account_enc" text NOT NULL,
	"ifsc" text NOT NULL,
	"bank_verified_at" timestamp with time zone,
	"consent_at" timestamp with time zone NOT NULL,
	"consent_text_version" integer DEFAULT 1 NOT NULL,
	"consent_withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_farmer_code_unique" UNIQUE("farmer_code")
);
--> statement-breakpoint
CREATE TABLE "moisture_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"crop" text NOT NULL,
	"base_moisture_x10" integer DEFAULT 120 NOT NULL,
	"deduction_permille_per_point" integer DEFAULT 10 NOT NULL,
	CONSTRAINT "moisture_rules_crop_unique" UNIQUE("crop")
);
--> statement-breakpoint
CREATE TABLE "payment_items" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"member_id" text NOT NULL,
	"purchase_ids" text[] NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"bank_ref" text,
	"retry_of_item_id" text,
	"retried_by_item_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_paise" integer NOT NULL,
	"file_key" text NOT NULL,
	"kind" text DEFAULT 'original' NOT NULL,
	"parent_run_id" text,
	"status" text DEFAULT 'created' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_board" (
	"id" text PRIMARY KEY NOT NULL,
	"crop" text NOT NULL,
	"grade" text NOT NULL,
	"rate_paise_per_quintal" integer NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer NOT NULL,
	"set_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"ai_value_x10" integer,
	"typed_value_x10" integer NOT NULL,
	"matched" boolean NOT NULL,
	"ai_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slip_no" text NOT NULL,
	"member_id" text NOT NULL,
	"crop" text NOT NULL,
	"grade" text NOT NULL,
	"gross_x10" integer NOT NULL,
	"tare_x10" integer NOT NULL,
	"moisture_x10" integer NOT NULL,
	"net_x10" integer NOT NULL,
	"rate_paise" integer NOT NULL,
	"amount_paise" integer NOT NULL,
	"price_version" integer NOT NULL,
	"member_snapshot_json" text NOT NULL,
	"device_id" text NOT NULL,
	"device_seq" integer NOT NULL,
	"prev_hash" text NOT NULL,
	"entry_hash" text NOT NULL,
	"signature" text NOT NULL,
	"corrects_id" uuid,
	"client_time" timestamp with time zone NOT NULL,
	"server_received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"flag_codes" text[],
	CONSTRAINT "purchases_slip_no_unique" UNIQUE("slip_no"),
	CONSTRAINT "net_non_negative" CHECK ("purchases"."net_x10" >= 0),
	CONSTRAINT "amount_non_negative" CHECK ("purchases"."amount_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sms_log" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_id" uuid NOT NULL,
	"to_mobile_masked" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_rejections" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"device_seq" integer NOT NULL,
	"reason" text NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"centre_id" text,
	"name" text NOT NULL,
	"email" text,
	"password_hash" text,
	"pin_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_run_id_payment_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payment_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_runs" ADD CONSTRAINT "payment_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_board" ADD CONSTRAINT "price_board_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_photos" ADD CONSTRAINT "purchase_photos_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_log" ADD CONSTRAINT "sms_log_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_rejections" ADD CONSTRAINT "sync_rejections_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_seq_idx" ON "purchases" USING btree ("device_id","device_seq");