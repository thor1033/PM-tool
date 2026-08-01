CREATE TABLE "activity" (
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text DEFAULT 'edit' NOT NULL,
	"text" text NOT NULL,
	"actor" text DEFAULT '' NOT NULL,
	CONSTRAINT "activity_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "capacity_hours" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "availability" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "financials" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "forecast" jsonb DEFAULT '{"bufferPct":15,"weighting":"duration"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "startup" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "comments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "custom" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_project_idx" ON "activity" USING btree ("project_id");