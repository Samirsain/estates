-- The owner folded Admin into MD. Admin accounts stay as history (their refs
-- are in the audit trail) but become disabled MD rows; only one MD may be
-- active (constraints.sql "one_active_md"), so none is re-enabled here.
UPDATE "StaffAccount" SET "role" = 'MD', "status" = 'DISABLED' WHERE "role" = 'ADMIN';
UPDATE "Task" SET "assigneeRole" = 'MD' WHERE "assigneeRole" = 'ADMIN';

-- The partial index compares role with an enum literal, so it must be dropped
-- while the type changes and recreated after.
DROP INDEX IF EXISTS "one_active_md";

ALTER TYPE "StaffRole" RENAME TO "StaffRole_old";
CREATE TYPE "StaffRole" AS ENUM ('MD', 'ACCOUNTS', 'CRM', 'MIS', 'PC');
ALTER TABLE "StaffAccount" ALTER COLUMN "role" TYPE "StaffRole" USING ("role"::text::"StaffRole");
ALTER TABLE "Task" ALTER COLUMN "assigneeRole" TYPE "StaffRole" USING ("assigneeRole"::text::"StaffRole");
DROP TYPE "StaffRole_old";

-- PRD §3.1 — exactly one active MD account (same as constraints.sql).
CREATE UNIQUE INDEX "one_active_md"
  ON "StaffAccount" ("role")
  WHERE "role" = 'MD' AND "status" = 'ACTIVE';
