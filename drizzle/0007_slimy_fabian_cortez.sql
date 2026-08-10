CREATE TABLE "notes" (
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"date" text DEFAULT '' NOT NULL,
	"category" text,
	"task_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_project_idx" ON "notes" USING btree ("project_id");--> statement-breakpoint
-- Row-Level Security, matching the tenant_isolation policy applied to every
-- other entity table exposed via the generic /api/projects/[id]/[entity] route
-- (see drizzle/0001_rls_pgvector.sql for the original policy set).
ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "notes";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "notes" USING (org_id = current_setting('app.current_org', true)::uuid) WITH CHECK (org_id = current_setting('app.current_org', true)::uuid);
