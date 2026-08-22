-- More kinds of neighbour, and a reference that is never compulsory.
--
-- A side can now name what is on it — a commercial or informal-sector Plot, a
-- park, a playground, facilities, a public utility — and give its number. The
-- number is optional everywhere, including for an adjacent Plot: knowing that a
-- Plot is next door is useful even when nobody recorded which Plot.
--
-- Road width stays compulsory. It is not a label, it is what decides the PLC
-- band, and a Road with no width has no band to land in.

-- The check constraint casts its literals to the enum, so it comes off before
-- the type is rebuilt and goes back on after, minus the Plot half.
ALTER TABLE "PlotBoundary" DROP CONSTRAINT "boundary_details_match_kind";

ALTER TYPE "BoundaryKind" RENAME TO "BoundaryKind_old";
CREATE TYPE "BoundaryKind" AS ENUM (
  'ROAD', 'PLOT', 'COMMERCIAL', 'INFORMAL_SECTOR',
  'PARK', 'PLAYGROUND', 'FACILITIES', 'PUBLIC_UTILITY', 'OTHER'
);
ALTER TABLE "PlotBoundary"
  ALTER COLUMN "kind" TYPE "BoundaryKind" USING "kind"::text::"BoundaryKind";
DROP TYPE "BoundaryKind_old";

ALTER TABLE "PlotBoundary" ADD CONSTRAINT "boundary_details_match_kind" CHECK (
  kind <> 'ROAD'::"BoundaryKind" OR "roadWidthFt" IS NOT NULL
);

-- The column held an adjacent Plot Number and now holds whatever that side is.
-- Existing values carry over unchanged; only the name widens.
ALTER TABLE "PlotBoundary" RENAME COLUMN "adjacentPlotNumber" TO "reference";
