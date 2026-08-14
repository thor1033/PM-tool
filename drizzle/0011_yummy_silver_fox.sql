ALTER TABLE "tasks" ADD COLUMN "kind" text DEFAULT 'build' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "meeting" jsonb DEFAULT '{}'::jsonb NOT NULL;