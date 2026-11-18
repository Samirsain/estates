-- The owner removed the MIS role (18 Nov 2026); MD already holds everything it
-- could do. None existed when this was written, but any MIS row that appears
-- before it runs is kept as history the way Admin was (20261013180000_md_only):
-- the account becomes a disabled MD row, its open Tasks go to MD, and a saved
-- MIS role set is dropped.
UPDATE "StaffAccount" SET "role" = 'MD', "status" = 'DISABLED' WHERE "role" = 'MIS';
UPDATE "Task" SET "assigneeRole" = 'MD' WHERE "assigneeRole" = 'MIS';
DELETE FROM "RolePermission" WHERE "role" = 'MIS';

-- The partial index compares role with an enum literal, so it must be dropped
-- while the type changes and recreated after.
DROP INDEX IF EXISTS "one_active_md";

ALTER TYPE "StaffRole" RENAME TO "StaffRole_old";
CREATE TYPE "StaffRole" AS ENUM ('MD', 'ACCOUNTS', 'CRM', 'PC');
ALTER TABLE "StaffAccount" ALTER COLUMN "role" TYPE "StaffRole" USING ("role"::text::"StaffRole");
ALTER TABLE "Task" ALTER COLUMN "assigneeRole" TYPE "StaffRole" USING ("assigneeRole"::text::"StaffRole");
ALTER TABLE "RolePermission" ALTER COLUMN "role" TYPE "StaffRole" USING ("role"::text::"StaffRole");
DROP TYPE "StaffRole_old";

-- PRD §3.1 — exactly one active MD account (same as constraints.sql).
CREATE UNIQUE INDEX "one_active_md"
  ON "StaffAccount" ("role")
  WHERE "role" = 'MD' AND "status" = 'ACTIVE';
