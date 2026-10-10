-- Business Model v2 Part 1b (docss Change Pack §8, §53).
-- APPROVED: a version approved with a later Effective from waits until then.
-- Paid Early is now requested by Accounts before MD approves it.

-- AlterEnum
ALTER TYPE "CommissionVersionStatus" ADD VALUE 'APPROVED';

-- AlterTable
ALTER TABLE "CommissionRecord" ADD COLUMN     "earlyRequestReason" TEXT,
ADD COLUMN     "earlyRequestedAt" TIMESTAMP(3),
ADD COLUMN     "earlyRequestedByRef" TEXT;


-- Mock data only: approvals given before the request step existed count as
-- requested at the moment they were approved, so the new CHECK holds.
UPDATE "CommissionRecord" SET "earlyRequestedAt" = "earlyApprovedAt", "earlyRequestedByRef" = "earlyApprovedByRef", "earlyRequestReason" = 'Approved before the request step existed.' WHERE "earlyApprovedAt" IS NOT NULL AND "earlyRequestedAt" IS NULL;
