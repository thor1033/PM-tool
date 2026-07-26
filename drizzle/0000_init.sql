CREATE TABLE "categories" (
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'purple' NOT NULL,
	CONSTRAINT "categories_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	CONSTRAINT "findings_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	CONSTRAINT "members_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'milestone' NOT NULL,
	"date" text DEFAULT '' NOT NULL,
	"category" text,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "milestones_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_org_id" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_workos_org_id_unique" UNIQUE("workos_org_id")
);
--> statement-breakpoint
CREATE TABLE "phases" (
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'teal' NOT NULL,
	CONSTRAINT "phases_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'pdf' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"task_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"phase" text,
	"date" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"placeholder" boolean DEFAULT true NOT NULL,
	CONSTRAINT "products_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'indigo' NOT NULL,
	"parent_id" uuid,
	"business_case" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scope" jsonb DEFAULT '{"inScope":[],"outScope":[]}'::jsonb NOT NULL,
	"assessment" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comm_plan" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"change_plan" jsonb DEFAULT '{"groups":[]}'::jsonb NOT NULL,
	"org_chart" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"glossary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kpis" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risks" (
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"likelihood" text DEFAULT 'med' NOT NULL,
	"impact" text DEFAULT 'med' NOT NULL,
	"mitigation" text DEFAULT '' NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"task_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "risks_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "stakeholders" (
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"responsibility" text DEFAULT '' NOT NULL,
	"influence" text DEFAULT 'med' NOT NULL,
	"interest" text DEFAULT 'med' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	CONSTRAINT "stakeholders_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	CONSTRAINT "tags_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'backlog' NOT NULL,
	"phase" text,
	"category" text,
	"priority" text DEFAULT 'med' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"start" text DEFAULT '' NOT NULL,
	"end" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assignees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "tasks_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_user_id" text NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_workos_user_id_unique" UNIQUE("workos_user_id")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholders" ADD CONSTRAINT "stakeholders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "findings_project_idx" ON "findings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "members_project_idx" ON "members" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "milestones_project_idx" ON "milestones" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "products_project_idx" ON "products" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_org_idx" ON "projects" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "risks_project_idx" ON "risks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "stakeholders_project_idx" ON "stakeholders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id");