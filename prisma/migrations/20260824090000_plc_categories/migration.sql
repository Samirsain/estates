-- PLC without codes.
--
-- The old model asked a Project to invent a category code, type it, and then
-- retype it per Plot. This replaces both halves: a fixed catalogue of four
-- categories whose percentages the Project sets, and applicability derived from
-- the Plot's own boundaries rather than stored against the Plot.
--
-- PRD §23.1 also sets the precision for every percentage and for Plot area at
-- four decimal places. Those widenings ride along here.

-- 1. A boundary may face a playground. ALTER TYPE ... ADD VALUE cannot be used
--    later in the same transaction, so the type is rebuilt instead.
--
--    boundary_details_match_kind has to come off first: its literals are cast to
--    the enum, so renaming the type out from under it leaves the constraint
--    comparing the old type against the new column. It goes back on unchanged
--    below, over the rebuilt type.
ALTER TABLE "PlotBoundary" DROP CONSTRAINT "boundary_details_match_kind";

ALTER TYPE "BoundaryKind" RENAME TO "BoundaryKind_old";
CREATE TYPE "BoundaryKind" AS ENUM ('ROAD', 'PLOT', 'PARK', 'PLAYGROUND', 'OTHER');
ALTER TABLE "PlotBoundary"
  ALTER COLUMN "kind" TYPE "BoundaryKind" USING "kind"::text::"BoundaryKind";
DROP TYPE "BoundaryKind_old";

ALTER TABLE "PlotBoundary" ADD CONSTRAINT "boundary_details_match_kind" CHECK (
  (kind <> 'ROAD'::"BoundaryKind" OR "roadWidthFt" IS NOT NULL)
  AND (kind <> 'PLOT'::"BoundaryKind" OR "adjacentPlotNumber" IS NOT NULL)
);

CREATE TYPE "PlcCategory" AS ENUM ('ROAD_WIDTH', 'OPEN_SIDES', 'PARK_FACING', 'PLAYGROUND_FACING');

-- 2. Park Facing stops being a flag and becomes what it always described: a
--    side that faces a park. Recorded boundaries win — a Plot whose four sides
--    are already known keeps them, and only a free side can take the park.
INSERT INTO "PlotBoundary" ("id", "plotId", "side", "kind")
SELECT gen_random_uuid(), p."id", free."side"::"BoundarySide", 'PARK'::"BoundaryKind"
FROM "Plot" p
CROSS JOIN LATERAL (
  SELECT s."side"
  FROM (VALUES ('NORTH'), ('EAST'), ('SOUTH'), ('WEST')) AS s("side")
  WHERE NOT EXISTS (
    SELECT 1 FROM "PlotBoundary" b
    WHERE b."plotId" = p."id" AND b."side" = s."side"::"BoundarySide"
  )
  LIMIT 1
) AS free
WHERE p."parkFacing" = true
  AND NOT EXISTS (
    SELECT 1 FROM "PlotBoundary" b WHERE b."plotId" = p."id" AND b."kind" = 'PARK'
  );

ALTER TABLE "Plot" DROP COLUMN "parkFacing";

-- 3. Applicability is no longer stored. It derives from the boundaries above on
--    every read (PLC spec §4.1, §4.3), so a corrected boundary corrects the PLC.
ALTER TABLE "Plot" DROP COLUMN "plcComponentCodes";

-- 4. Areas to four decimals (PRD §23.1).
ALTER TABLE "Plot"
  ALTER COLUMN "areaSqFt" TYPE DECIMAL(12, 4),
  ALTER COLUMN "areaSqYd" TYPE DECIMAL(12, 4),
  ALTER COLUMN "areaSqM" TYPE DECIMAL(12, 4),
  ALTER COLUMN "exactAreaSqFt" TYPE DECIMAL(12, 4);
ALTER TABLE "Acquisition" ALTER COLUMN "areaSqFt" TYPE DECIMAL(12, 4);

-- 5. A configured component becomes a category and a band.
--
--    An existing component cannot be carried across: a typed "ROAD_FACING" row
--    never held the road width its band would need, and inventing one would be
--    the silent commercial guess PLC spec §5.3 forbids. So each affected
--    version is superseded and its rows are removed. Frozen Hold and Booking
--    snapshots are untouched and stay readable — they carry their own JSON —
--    and every affected Project must publish a fresh version before it can sell,
--    which the screen states plainly rather than quietly charging 0%.
UPDATE "PlcRuleVersion"
SET "status" = 'SUPERSEDED'
WHERE "status" IN ('PUBLISHED', 'DRAFT')
  AND EXISTS (SELECT 1 FROM "PlcComponent" c WHERE c."ruleVersionId" = "PlcRuleVersion"."id");

DELETE FROM "PlcComponent";

DROP INDEX IF EXISTS "PlcComponent_ruleVersionId_code_key";
ALTER TABLE "PlcComponent"
  DROP COLUMN "code",
  DROP COLUMN "label",
  ADD COLUMN "category" "PlcCategory" NOT NULL,
  ADD COLUMN "threshold" DECIMAL(8, 2),
  ALTER COLUMN "percent" TYPE DECIMAL(7, 4);

CREATE UNIQUE INDEX "PlcComponent_ruleVersionId_category_threshold_key"
  ON "PlcComponent" ("ruleVersionId", "category", "threshold");

-- A NULL threshold does not collide in a plain unique index, which would let a
-- Project configure Park facing twice. This closes that at the database.
CREATE UNIQUE INDEX "PlcComponent_ruleVersionId_category_unbanded_key"
  ON "PlcComponent" ("ruleVersionId", "category")
  WHERE "threshold" IS NULL;

-- 6. Remaining percentages to four decimals (PRD §23.1).
ALTER TABLE "PlcSnapshot" ALTER COLUMN "totalPercent" TYPE DECIMAL(7, 4);
ALTER TABLE "Acquisition" ALTER COLUMN "plcPercent" TYPE DECIMAL(7, 4);
ALTER TABLE "CustomerProfile" ALTER COLUMN "introducedRatePercent" TYPE DECIMAL(7, 4);
ALTER TABLE "MemberProfile" ALTER COLUMN "inviteRatePercent" TYPE DECIMAL(7, 4);
