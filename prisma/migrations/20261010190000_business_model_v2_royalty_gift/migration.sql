-- Business Model v2 Part 2 — Royalty Gift, Stable Buyback Completion (SSOT §61, §67–§83; Change Pack §40–§51).

-- CreateEnum
CREATE TYPE "RewardQualificationRoute" AS ENUM ('PAYMENT_100', 'APPROVED_BUYBACK');

-- CreateEnum
CREATE TYPE "RoyaltyCreditState" AS ENUM ('ELIGIBLE', 'SELECTED', 'ORDERED', 'DELIVERED', 'REVERSED');

-- CreateEnum
CREATE TYPE "RewardHoldReason" AS ENUM ('RECOVERY_OUTSTANDING', 'MEMBER_DEACTIVATED', 'BUYBACK_STABLE_COMPLETION_PENDING', 'REWARD_DEFICIENT', 'NOMINEE_APPROVAL_PENDING', 'PROGRAMME_TERMS_ACTION_REQUIRED', 'STAFF_CONFLICT_REVIEW', 'RECOVERY_CIRCUMVENTION_REVIEW');

-- CreateEnum
CREATE TYPE "RewardRecipient" AS ENUM ('SELF', 'SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'NON_FAMILY');

-- AlterTable
ALTER TABLE "Acquisition" ADD COLUMN     "documentsReturnRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "documentsReturnedAt" TIMESTAMP(3),
ADD COLUMN     "documentsReturnedByRef" TEXT,
ADD COLUMN     "stableCompletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "royaltyProgrammeVersionId" TEXT;

-- AlterTable
ALTER TABLE "CustomerProfile" ADD COLUMN     "royaltyLinkFinalRoute" "RewardQualificationRoute",
ADD COLUMN     "royaltyOpportunityConsumedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RoyaltyProgrammeVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "CommissionVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "programmeRef" TEXT NOT NULL,
    "catalogueVersion" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "preparedByRef" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "economicsReviewedByRef" TEXT,
    "economicsReviewedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "RoyaltyProgrammeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoyaltyCredit" (
    "id" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "memberProfileId" TEXT NOT NULL,
    "triggerBookingId" TEXT NOT NULL,
    "programmeVersionId" TEXT NOT NULL,
    "state" "RoyaltyCreditState" NOT NULL DEFAULT 'ELIGIBLE',
    "qualificationRoute" "RewardQualificationRoute" NOT NULL,
    "eligibleAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "holdReason" "RewardHoldReason",
    "selectedRewardRef" TEXT,
    "selectedAt" TIMESTAMP(3),
    "recipient" "RewardRecipient",
    "recipientName" TEXT,
    "recipientApprovedByRef" TEXT,
    "recipientApprovedAt" TIMESTAMP(3),
    "orderedAt" TIMESTAMP(3),
    "orderReference" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "deliveryReference" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoyaltyCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoyaltyCreditEvent" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorRef" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT,
    "reason" TEXT,

    CONSTRAINT "RoyaltyCreditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoyaltyProgrammeVersion_version_key" ON "RoyaltyProgrammeVersion"("version");

-- CreateIndex
CREATE UNIQUE INDEX "RoyaltyCredit_triggerBookingId_key" ON "RoyaltyCredit"("triggerBookingId");

-- CreateIndex
CREATE INDEX "RoyaltyCredit_memberProfileId_state_idx" ON "RoyaltyCredit"("memberProfileId", "state");

-- CreateIndex
CREATE INDEX "RoyaltyCredit_customerProfileId_idx" ON "RoyaltyCredit"("customerProfileId");

-- CreateIndex
CREATE INDEX "RoyaltyCreditEvent_creditId_at_idx" ON "RoyaltyCreditEvent"("creditId", "at");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_royaltyProgrammeVersionId_fkey" FOREIGN KEY ("royaltyProgrammeVersionId") REFERENCES "RoyaltyProgrammeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyCredit" ADD CONSTRAINT "RoyaltyCredit_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyCredit" ADD CONSTRAINT "RoyaltyCredit_memberProfileId_fkey" FOREIGN KEY ("memberProfileId") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyCredit" ADD CONSTRAINT "RoyaltyCredit_triggerBookingId_fkey" FOREIGN KEY ("triggerBookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyCredit" ADD CONSTRAINT "RoyaltyCredit_programmeVersionId_fkey" FOREIGN KEY ("programmeVersionId") REFERENCES "RoyaltyProgrammeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyCreditEvent" ADD CONSTRAINT "RoyaltyCreditEvent_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "RoyaltyCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

