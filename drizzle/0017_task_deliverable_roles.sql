ALTER TABLE "tasks" ADD COLUMN "involved_roles" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "deliverable" text DEFAULT '' NOT NULL;