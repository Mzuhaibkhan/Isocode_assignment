ALTER TABLE "members" ADD COLUMN "centre_id" text;
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "centres"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_photos" ADD COLUMN "image_data" text;
--> statement-breakpoint
ALTER TABLE "payment_runs" ADD COLUMN "file_content" text;
