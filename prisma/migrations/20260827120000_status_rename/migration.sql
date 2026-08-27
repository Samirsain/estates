-- Lifecycle is called Status everywhere it is read, so the schema says Status too.
ALTER TYPE "ProjectLifecycle" RENAME TO "ProjectStatus";
ALTER TYPE "PlotLifecycle" RENAME TO "PlotStatus";

ALTER TABLE "Project" RENAME COLUMN "lifecycle" TO "status";
ALTER TABLE "Plot" RENAME COLUMN "lifecycle" TO "status";
ALTER TABLE "PlotEvent" RENAME COLUMN "fromLifecycle" TO "fromStatus";
ALTER TABLE "PlotEvent" RENAME COLUMN "toLifecycle" TO "toStatus";

ALTER INDEX "Plot_lifecycle_idx" RENAME TO "Plot_status_idx";
