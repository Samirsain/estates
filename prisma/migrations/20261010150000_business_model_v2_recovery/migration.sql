-- Business Model v2 Part 1c — Recovery Outstanding (SSOT §22, §91; Change Pack §54).

-- CreateEnum
CREATE TYPE "RecoveryStatus" AS ENUM ('OUTSTANDING', 'CLEARED');

-- CreateEnum
CREATE TYPE "RecoveryClearance" AS ENUM ('REPAID', 'SET_OFF');

-- AlterEnum
ALTER TYPE "CommissionHoldReason" ADD VALUE 'RECOVERY_OUTSTANDING';

-- CreateTable
CREATE TABLE "Recovery" (
    "id" TEXT NOT NULL,
    "recoveryNo" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "commissionRecordId" TEXT NOT NULL,
    "status" "RecoveryStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "noticeOn" TIMESTAMP(3) NOT NULL,
    "dueOn" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "openedByRef" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedHow" "RecoveryClearance",
    "clearedByRef" TEXT,
    "clearedAt" TIMESTAMP(3),
    "clearNote" TEXT,
    "setOffRecordId" TEXT,

    CONSTRAINT "Recovery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Recovery_recoveryNo_key" ON "Recovery"("recoveryNo");

-- CreateIndex
CREATE INDEX "Recovery_personId_status_idx" ON "Recovery"("personId", "status");

-- CreateIndex
CREATE INDEX "Recovery_commissionRecordId_idx" ON "Recovery"("commissionRecordId");

-- AddForeignKey
ALTER TABLE "Recovery" ADD CONSTRAINT "Recovery_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recovery" ADD CONSTRAINT "Recovery_commissionRecordId_fkey" FOREIGN KEY ("commissionRecordId") REFERENCES "CommissionRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recovery" ADD CONSTRAINT "Recovery_setOffRecordId_fkey" FOREIGN KEY ("setOffRecordId") REFERENCES "CommissionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

