-- Business Model v2 Part 3 — Sales & Reference Trip Reward (SSOT §39–§66; Change Pack §7–§9, §22–§39).

-- CreateEnum
CREATE TYPE "TripCreditType" AS ENUM ('OWN_SALE', 'REFERENCE');

-- CreateEnum
CREATE TYPE "TripCreditState" AS ENUM ('PENDING', 'QUALIFIED', 'ALLOCATED', 'USED', 'HELD', 'REVERSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TripBucketState" AS ENUM ('OPEN', 'EARNED', 'DEFICIENT', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TripRewardState" AS ENUM ('EARNED', 'BOOKED', 'TRAVELLED', 'DEFICIENT', 'CANCELLED');

-- AlterTable
ALTER TABLE "MemberProfile" ADD COLUMN     "inviterFrozenAt" TIMESTAMP(3),
ADD COLUMN     "referenceOpportunityConsumedAt" TIMESTAMP(3),
ADD COLUMN     "referenceWinningBookingId" TEXT;

-- AlterTable
ALTER TABLE "ProjectCommissionVersion" ADD COLUMN     "economicsReviewedAt" TIMESTAMP(3),
ADD COLUMN     "economicsReviewedByRef" TEXT,
ADD COLUMN     "tripCutOffAt" TIMESTAMP(3),
ADD COLUMN     "tripEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tripMaxReferenceCredits" INTEGER,
ADD COLUMN     "tripMinOwnCredits" INTEGER,
ADD COLUMN     "tripProgrammeCode" TEXT,
ADD COLUMN     "tripProgrammeVersionRef" TEXT,
ADD COLUMN     "tripTermsVersionRef" TEXT,
ADD COLUMN     "tripTotalTarget" INTEGER,
ADD COLUMN     "tripWindDownAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TripInventoryRule" (
    "id" TEXT NOT NULL,
    "settingsVersionId" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "parentCreditPoolPlotId" TEXT,
    "reason" TEXT NOT NULL,

    CONSTRAINT "TripInventoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripCredit" (
    "id" TEXT NOT NULL,
    "memberProfileId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "programmeCode" TEXT NOT NULL,
    "settingsVersionId" TEXT NOT NULL,
    "creditType" "TripCreditType" NOT NULL,
    "sourceBookingId" TEXT NOT NULL,
    "creditPlotId" TEXT NOT NULL,
    "introducedMemberId" TEXT,
    "state" "TripCreditState" NOT NULL,
    "qualificationRoute" "RewardQualificationRoute",
    "pendingAt" TIMESTAMP(3),
    "qualifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "bucketId" TEXT,
    "usedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripBucket" (
    "id" TEXT NOT NULL,
    "memberProfileId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "programmeCode" TEXT NOT NULL,
    "settingsVersionId" TEXT NOT NULL,
    "totalTarget" INTEGER NOT NULL,
    "minOwnCredits" INTEGER NOT NULL,
    "maxReferenceCredits" INTEGER NOT NULL,
    "programmeVersionRef" TEXT NOT NULL,
    "termsVersionRef" TEXT NOT NULL,
    "windDownAt" TIMESTAMP(3),
    "openingCreditId" TEXT,
    "state" "TripBucketState" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "earnedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "TripBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripReward" (
    "id" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "memberProfileId" TEXT NOT NULL,
    "state" "TripRewardState" NOT NULL DEFAULT 'EARNED',
    "holdReason" "RewardHoldReason",
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termsVersionRef" TEXT NOT NULL,
    "recipient" "RewardRecipient",
    "recipientName" TEXT,
    "recipientApprovedByRef" TEXT,
    "recipientApprovedAt" TIMESTAMP(3),
    "bookingReference" TEXT,
    "bookedAt" TIMESTAMP(3),
    "travelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripEvent" (
    "id" TEXT NOT NULL,
    "memberProfileId" TEXT NOT NULL,
    "creditId" TEXT,
    "bucketId" TEXT,
    "rewardId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorRef" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT,
    "reason" TEXT,

    CONSTRAINT "TripEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripInventoryRule_settingsVersionId_plotId_key" ON "TripInventoryRule"("settingsVersionId", "plotId");

-- CreateIndex
CREATE INDEX "TripCredit_memberProfileId_projectId_programmeCode_state_idx" ON "TripCredit"("memberProfileId", "projectId", "programmeCode", "state");

-- CreateIndex
CREATE INDEX "TripCredit_sourceBookingId_idx" ON "TripCredit"("sourceBookingId");

-- CreateIndex
CREATE INDEX "TripCredit_state_expiresAt_idx" ON "TripCredit"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "TripBucket_memberProfileId_projectId_programmeCode_state_idx" ON "TripBucket"("memberProfileId", "projectId", "programmeCode", "state");

-- CreateIndex
CREATE UNIQUE INDEX "TripReward_bucketId_key" ON "TripReward"("bucketId");

-- CreateIndex
CREATE INDEX "TripReward_memberProfileId_state_idx" ON "TripReward"("memberProfileId", "state");

-- CreateIndex
CREATE INDEX "TripEvent_memberProfileId_at_idx" ON "TripEvent"("memberProfileId", "at");

-- AddForeignKey
ALTER TABLE "TripInventoryRule" ADD CONSTRAINT "TripInventoryRule_settingsVersionId_fkey" FOREIGN KEY ("settingsVersionId") REFERENCES "ProjectCommissionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCredit" ADD CONSTRAINT "TripCredit_memberProfileId_fkey" FOREIGN KEY ("memberProfileId") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCredit" ADD CONSTRAINT "TripCredit_settingsVersionId_fkey" FOREIGN KEY ("settingsVersionId") REFERENCES "ProjectCommissionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCredit" ADD CONSTRAINT "TripCredit_sourceBookingId_fkey" FOREIGN KEY ("sourceBookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCredit" ADD CONSTRAINT "TripCredit_introducedMemberId_fkey" FOREIGN KEY ("introducedMemberId") REFERENCES "MemberProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCredit" ADD CONSTRAINT "TripCredit_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "TripBucket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripBucket" ADD CONSTRAINT "TripBucket_memberProfileId_fkey" FOREIGN KEY ("memberProfileId") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripBucket" ADD CONSTRAINT "TripBucket_settingsVersionId_fkey" FOREIGN KEY ("settingsVersionId") REFERENCES "ProjectCommissionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripReward" ADD CONSTRAINT "TripReward_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "TripBucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripReward" ADD CONSTRAINT "TripReward_memberProfileId_fkey" FOREIGN KEY ("memberProfileId") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

