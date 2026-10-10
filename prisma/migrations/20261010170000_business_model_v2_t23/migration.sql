-- Business Model v2 Part 1d — T23 Correct Beneficiary Before Old Recovery (Change Pack §64).

-- AlterEnum
ALTER TYPE "CommissionHoldReason" ADD VALUE 'OLD_RECOVERY_PENDING';

-- AlterTable
ALTER TABLE "CommissionRecord" ADD COLUMN     "beforeRecoveryApprovedAt" TIMESTAMP(3),
ADD COLUMN     "beforeRecoveryApprovedByRef" TEXT,
ADD COLUMN     "beforeRecoveryNote" TEXT;

