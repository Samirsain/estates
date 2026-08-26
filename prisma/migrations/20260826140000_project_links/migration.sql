-- Two links a Project carries: where it is, and where its documents are.
--
-- The existing `location` column is prose — "Ajmer Road, Jaipur". These are
-- URLs, so they are separate columns rather than something parsed back out of
-- that text. Both nullable: a Project is set up long before either link exists,
-- and neither is worth blocking creation over.
ALTER TABLE "Project" ADD COLUMN "locationUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN "driveUrl" TEXT;
