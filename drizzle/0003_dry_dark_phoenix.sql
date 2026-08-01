CREATE TABLE "externals" (
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"party" text DEFAULT '' NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"due" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "externals_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "externals" ADD CONSTRAINT "externals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "externals_project_idx" ON "externals" USING btree ("project_id");--> statement-breakpoint
-- Row-Level Security, matching the tenant_isolation policy applied to every
-- other entity table exposed via the generic /api/projects/[id]/[entity] route
-- (see drizzle/0001_rls_pgvector.sql for the original policy set).
ALTER TABLE "externals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "externals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "externals";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "externals" USING (org_id = current_setting('app.current_org', true)::uuid) WITH CHECK (org_id = current_setting('app.current_org', true)::uuid);