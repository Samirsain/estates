-- A Project may be Agricultural.
--
-- ALTER TYPE ... ADD VALUE cannot be used later in the same transaction, and
-- Prisma runs a migration as one, so the type is rebuilt instead — the same
-- approach 20260824090000_plc_categories took for BoundaryKind.
--
-- Two columns carry this type: Project.type, which is required, and
-- Acquisition.projectType, which is nullable and records what an outside
-- property was before it entered inventory. Both are cast through text, so
-- every existing row keeps the value it already had.
--
-- MIXED stays in the type. The form stopped offering it long ago and
-- createProjectAction refuses it, but Projects created before that still carry
-- it and dropping the value would fail the cast.
ALTER TYPE "ProjectType" RENAME TO "ProjectType_old";
CREATE TYPE "ProjectType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'AGRICULTURAL', 'MIXED');

ALTER TABLE "Project"
  ALTER COLUMN "type" TYPE "ProjectType" USING "type"::text::"ProjectType";
ALTER TABLE "Acquisition"
  ALTER COLUMN "projectType" TYPE "ProjectType" USING "projectType"::text::"ProjectType";

DROP TYPE "ProjectType_old";
