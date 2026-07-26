-- ============================================================
-- pgvector extension + embeddings table (dormant until RAG lands)
-- and Row-Level Security policies for tenant isolation.
-- ============================================================

-- ---------- pgvector ----------
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "embeddings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "ref_id" text,
  "content" text NOT NULL,
  "embedding" vector(1024),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "embeddings_project_idx" ON "embeddings" ("project_id");

-- ---------- Row-Level Security ----------
-- Every tenant-data table is scoped to the org set on the connection via
-- `SET LOCAL app.current_org`. FORCE ensures even the table owner (the role
-- Neon connects as) is subject to the policy. `current_setting(..., true)`
-- returns NULL when unset, so unset context fails closed (no rows).

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'projects','tasks','risks','stakeholders','members','findings',
    'products','milestones','tags','phases','categories','embeddings'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (org_id = current_setting(''app.current_org'', true)::uuid) WITH CHECK (org_id = current_setting(''app.current_org'', true)::uuid)',
      t
    );
  END LOOP;
END $$;