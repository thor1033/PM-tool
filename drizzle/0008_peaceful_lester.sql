ALTER TABLE "tasks" ADD COLUMN "completed_on" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Backfill: tasks already marked done have no recorded completion date (the
-- app never stored one and the audit trail is empty), so there is nothing to
-- recover. They are stamped with the migration date as an explicit, agreed
-- placeholder — efficiency figures for this pre-existing work are therefore
-- not meaningful, only work completed from here on is.
UPDATE "tasks" SET "completed_on" = to_char(now(), 'YYYY-MM-DD')
WHERE "status" = 'done' AND "completed_on" = '';
