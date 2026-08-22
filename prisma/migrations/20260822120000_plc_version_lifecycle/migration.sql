-- PLC spec §3.1/§3.4 — Draft → Published → Superseded version lifecycle, and
-- §7.2/§11 — the snapshot correction supersession chain.

-- CreateEnum
CREATE TYPE "PlcVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- AlterTable: PlcRuleVersion
ALTER TABLE "PlcRuleVersion"
  ADD COLUMN "status" "PlcVersionStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "effectiveTo" TIMESTAMP(3),
  ADD COLUMN "publishedBy" TEXT,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "supersededById" TEXT;

ALTER TABLE "PlcRuleVersion"
  ALTER COLUMN "effectiveFrom" DROP NOT NULL,
  ALTER COLUMN "effectiveFrom" DROP DEFAULT;

-- Every version that exists today was published the moment it was created.
UPDATE "PlcRuleVersion" SET
  "status"      = CASE WHEN "isCurrent" THEN 'PUBLISHED'::"PlcVersionStatus"
                       ELSE 'SUPERSEDED'::"PlcVersionStatus" END,
  "createdAt"   = "effectiveFrom",
  "publishedAt" = "effectiveFrom",
  "publishedBy" = "createdBy";

-- Rebuild the supersession chain from the version order it was recorded in.
UPDATE "PlcRuleVersion" older SET
  "supersededById" = newer."id",
  "effectiveTo"    = newer."effectiveFrom"
FROM "PlcRuleVersion" newer
WHERE newer."projectId" = older."projectId"
  AND newer."version" = older."version" + 1
  AND older."status" = 'SUPERSEDED';

ALTER TABLE "PlcRuleVersion" DROP COLUMN "isCurrent";

CREATE UNIQUE INDEX "PlcRuleVersion_supersededById_key" ON "PlcRuleVersion"("supersededById");

ALTER TABLE "PlcRuleVersion" ADD CONSTRAINT "PlcRuleVersion_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "PlcRuleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: PlcSnapshot
ALTER TABLE "PlcSnapshot"
  ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "supersededById" TEXT,
  ADD COLUMN "correctionReason" TEXT,
  ADD COLUMN "correctedBy" TEXT;

-- A snapshot frozen for a Change Plot that was later rejected is History, not
-- current use (PLC spec §10.3).
UPDATE "PlcSnapshot" s SET "isCurrent" = false
WHERE EXISTS (
  SELECT 1 FROM "ChangePlotRequest" r
  WHERE r."replacementPlcSnapshotId" = s."id" AND r."status" = 'REJECTED'
);

CREATE UNIQUE INDEX "PlcSnapshot_supersededById_key" ON "PlcSnapshot"("supersededById");
CREATE INDEX "PlcSnapshot_plotId_isCurrent_idx" ON "PlcSnapshot"("plotId", "isCurrent");

ALTER TABLE "PlcSnapshot" ADD CONSTRAINT "PlcSnapshot_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "PlcSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
