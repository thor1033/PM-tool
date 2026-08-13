ALTER TABLE "projects" ALTER COLUMN "org_chart" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "forecast" SET DEFAULT '{"bufferPct":20,"weighting":"duration"}'::jsonb;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "owner" text;