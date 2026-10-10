-- CreateEnum
CREATE TYPE "CloseRelation" AS ENUM ('SPOUSE', 'PARENT', 'CHILD', 'SIBLING');

-- CreateEnum
CREATE TYPE "CircumventionIndicator" AS ENUM ('BANK_ACCOUNT', 'MOBILE', 'ADDRESS');

-- CreateEnum
CREATE TYPE "CircumventionStatus" AS ENUM ('PENDING_REVIEW', 'CLEARED', 'RESTRICTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CommissionHoldReason" ADD VALUE 'STAFF_CONFLICT_REVIEW';
ALTER TYPE "CommissionHoldReason" ADD VALUE 'RECOVERY_CIRCUMVENTION_REVIEW';

-- AlterTable
ALTER TABLE "BankDetail" ADD COLUMN     "accountBlindIndex" TEXT,
ADD COLUMN     "jointAccountProof" TEXT;

-- AlterTable
ALTER TABLE "PaymentReceivedEntry" ADD COLUMN     "payerName" TEXT,
ADD COLUMN     "payerReference" TEXT;

-- CreateTable
CREATE TABLE "StaffRelative" (
    "id" TEXT NOT NULL,
    "staffPersonId" TEXT NOT NULL,
    "relativePersonId" TEXT NOT NULL,
    "relation" "CloseRelation" NOT NULL,
    "declaredByRef" TEXT NOT NULL,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedByRef" TEXT,
    "endReason" TEXT,

    CONSTRAINT "StaffRelative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffConflictReview" (
    "id" TEXT NOT NULL,
    "recordKind" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "staffPersonIds" TEXT[],
    "status" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "StaffConflictReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircumventionReview" (
    "id" TEXT NOT NULL,
    "subjectPersonId" TEXT NOT NULL,
    "recoveryId" TEXT NOT NULL,
    "indicators" "CircumventionIndicator"[],
    "status" "CircumventionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "CircumventionReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffRelative_staffPersonId_idx" ON "StaffRelative"("staffPersonId");

-- CreateIndex
CREATE INDEX "StaffRelative_relativePersonId_idx" ON "StaffRelative"("relativePersonId");

-- CreateIndex
CREATE INDEX "StaffConflictReview_personId_status_idx" ON "StaffConflictReview"("personId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffConflictReview_recordKind_recordId_key" ON "StaffConflictReview"("recordKind", "recordId");

-- CreateIndex
CREATE INDEX "CircumventionReview_status_idx" ON "CircumventionReview"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CircumventionReview_subjectPersonId_recoveryId_key" ON "CircumventionReview"("subjectPersonId", "recoveryId");

-- CreateIndex
CREATE INDEX "BankDetail_accountBlindIndex_idx" ON "BankDetail"("accountBlindIndex");

-- AddForeignKey
ALTER TABLE "StaffRelative" ADD CONSTRAINT "StaffRelative_staffPersonId_fkey" FOREIGN KEY ("staffPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRelative" ADD CONSTRAINT "StaffRelative_relativePersonId_fkey" FOREIGN KEY ("relativePersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffConflictReview" ADD CONSTRAINT "StaffConflictReview_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircumventionReview" ADD CONSTRAINT "CircumventionReview_subjectPersonId_fkey" FOREIGN KEY ("subjectPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircumventionReview" ADD CONSTRAINT "CircumventionReview_recoveryId_fkey" FOREIGN KEY ("recoveryId") REFERENCES "Recovery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

