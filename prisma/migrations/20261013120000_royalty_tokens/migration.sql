-- CreateEnum
CREATE TYPE "RoyaltyAwardState" AS ENUM ('PENDING', 'RELEASED', 'REVERSED');

-- CreateEnum
CREATE TYPE "TokenEntryKind" AS ENUM ('AWARD_POSTED', 'AWARD_REVERSED', 'REDEMPTION', 'REDEMPTION_CORRECTED');

-- CreateEnum
CREATE TYPE "TokenRedemptionState" AS ENUM ('AWAITING_MD', 'RECORDED', 'REJECTED', 'CORRECTED');

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_royaltyProgrammeVersionId_fkey";

-- DropForeignKey
ALTER TABLE "RoyaltyCredit" DROP CONSTRAINT "RoyaltyCredit_customerProfileId_fkey";

-- DropForeignKey
ALTER TABLE "RoyaltyCredit" DROP CONSTRAINT "RoyaltyCredit_memberProfileId_fkey";

-- DropForeignKey
ALTER TABLE "RoyaltyCredit" DROP CONSTRAINT "RoyaltyCredit_programmeVersionId_fkey";

-- DropForeignKey
ALTER TABLE "RoyaltyCredit" DROP CONSTRAINT "RoyaltyCredit_triggerBookingId_fkey";

-- DropForeignKey
ALTER TABLE "RoyaltyCreditEvent" DROP CONSTRAINT "RoyaltyCreditEvent_creditId_fkey";

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "royaltyProgrammeVersionId",
ADD COLUMN     "royaltyTokensPerAward" INTEGER;

-- AlterTable
ALTER TABLE "ProjectCommissionVersion" ADD COLUMN     "royaltyTokensPerAward" INTEGER;

-- DropTable
DROP TABLE "RoyaltyCredit";

-- DropTable
DROP TABLE "RoyaltyCreditEvent";

-- DropTable
DROP TABLE "RoyaltyProgrammeVersion";

-- DropEnum
DROP TYPE "RoyaltyCreditState";

-- CreateTable
CREATE TABLE "RoyaltyAward" (
    "id" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "memberProfileId" TEXT NOT NULL,
    "triggerBookingId" TEXT NOT NULL,
    "bookingReviewVersion" INTEGER NOT NULL,
    "projectId" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "state" "RoyaltyAwardState" NOT NULL DEFAULT 'PENDING',
    "qualificationRoute" "RewardQualificationRoute" NOT NULL,
    "holdReason" "RewardHoldReason",
    "qualifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postings" INTEGER NOT NULL DEFAULT 0,
    "releasedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoyaltyAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoyaltyAwardEvent" (
    "id" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorRef" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT,
    "reason" TEXT,

    CONSTRAINT "RoyaltyAwardEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenLedgerEntry" (
    "id" TEXT NOT NULL,
    "memberProfileId" TEXT NOT NULL,
    "kind" "TokenEntryKind" NOT NULL,
    "tokens" INTEGER NOT NULL,
    "awardId" TEXT,
    "cycle" INTEGER,
    "redemptionId" TEXT,
    "reversesEntryId" TEXT,
    "actorRef" TEXT NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenRedemption" (
    "id" TEXT NOT NULL,
    "memberProfileId" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "redeemedOn" DATE NOT NULL,
    "recipient" "RewardRecipient" NOT NULL,
    "recipientName" TEXT,
    "reference" TEXT,
    "state" "TokenRedemptionState" NOT NULL,
    "requestKey" TEXT NOT NULL,
    "recordedByRef" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "correctedByRef" TEXT,
    "correctedAt" TIMESTAMP(3),
    "correctionReason" TEXT,

    CONSTRAINT "TokenRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenAllocation" (
    "id" TEXT NOT NULL,
    "memberProfileId" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "redemptionId" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,

    CONSTRAINT "TokenAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoyaltyAward_triggerBookingId_key" ON "RoyaltyAward"("triggerBookingId");

-- CreateIndex
CREATE INDEX "RoyaltyAward_memberProfileId_state_idx" ON "RoyaltyAward"("memberProfileId", "state");

-- CreateIndex
CREATE INDEX "RoyaltyAward_customerProfileId_idx" ON "RoyaltyAward"("customerProfileId");

-- CreateIndex
CREATE INDEX "RoyaltyAwardEvent_awardId_at_idx" ON "RoyaltyAwardEvent"("awardId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "TokenLedgerEntry_reversesEntryId_key" ON "TokenLedgerEntry"("reversesEntryId");

-- CreateIndex
CREATE INDEX "TokenLedgerEntry_memberProfileId_at_idx" ON "TokenLedgerEntry"("memberProfileId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "TokenLedgerEntry_awardId_kind_cycle_key" ON "TokenLedgerEntry"("awardId", "kind", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "TokenLedgerEntry_redemptionId_kind_key" ON "TokenLedgerEntry"("redemptionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "TokenRedemption_requestKey_key" ON "TokenRedemption"("requestKey");

-- CreateIndex
CREATE INDEX "TokenRedemption_memberProfileId_state_idx" ON "TokenRedemption"("memberProfileId", "state");

-- CreateIndex
CREATE INDEX "TokenAllocation_awardId_idx" ON "TokenAllocation"("awardId");

-- CreateIndex
CREATE INDEX "TokenAllocation_redemptionId_idx" ON "TokenAllocation"("redemptionId");

-- CreateIndex
CREATE INDEX "TokenAllocation_memberProfileId_idx" ON "TokenAllocation"("memberProfileId");

-- AddForeignKey
ALTER TABLE "RoyaltyAward" ADD CONSTRAINT "RoyaltyAward_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyAward" ADD CONSTRAINT "RoyaltyAward_memberProfileId_fkey" FOREIGN KEY ("memberProfileId") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyAward" ADD CONSTRAINT "RoyaltyAward_triggerBookingId_fkey" FOREIGN KEY ("triggerBookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyAward" ADD CONSTRAINT "RoyaltyAward_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyAwardEvent" ADD CONSTRAINT "RoyaltyAwardEvent_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "RoyaltyAward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenLedgerEntry" ADD CONSTRAINT "TokenLedgerEntry_memberProfileId_fkey" FOREIGN KEY ("memberProfileId") REFERENCES "MemberProfile"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenLedgerEntry" ADD CONSTRAINT "TokenLedgerEntry_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "RoyaltyAward"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenLedgerEntry" ADD CONSTRAINT "TokenLedgerEntry_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "TokenRedemption"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenLedgerEntry" ADD CONSTRAINT "TokenLedgerEntry_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "TokenLedgerEntry"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TokenRedemption" ADD CONSTRAINT "TokenRedemption_memberProfileId_fkey" FOREIGN KEY ("memberProfileId") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenAllocation" ADD CONSTRAINT "TokenAllocation_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "RoyaltyAward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenAllocation" ADD CONSTRAINT "TokenAllocation_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "TokenRedemption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------- Royalty Tokens (docss/11)

-- docss/11 §1, §2 — whole tokens, bounded to the range the service accepts.
ALTER TABLE "ProjectCommissionVersion" DROP CONSTRAINT IF EXISTS "royalty_tokens_range";
ALTER TABLE "ProjectCommissionVersion" ADD CONSTRAINT "royalty_tokens_range"
  CHECK ("royaltyTokensPerAward" IS NULL OR "royaltyTokensPerAward" BETWEEN 1 AND 1000000);
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "booking_royalty_tokens_range";
ALTER TABLE "Booking" ADD CONSTRAINT "booking_royalty_tokens_range"
  CHECK ("royaltyTokensPerAward" IS NULL OR "royaltyTokensPerAward" BETWEEN 1 AND 1000000);

-- A released award has posted; a reversed one says when.
ALTER TABLE "RoyaltyAward" DROP CONSTRAINT IF EXISTS "royalty_award_shape";
ALTER TABLE "RoyaltyAward" ADD CONSTRAINT "royalty_award_shape"
  CHECK ("tokens" BETWEEN 1 AND 1000000 AND "postings" >= 0
     AND ("state" <> 'RELEASED' OR ("releasedAt" IS NOT NULL AND "postings" > 0))
     AND ("state" <> 'REVERSED' OR ("reversedAt" IS NOT NULL AND length(btrim(coalesce("reversalReason", ''))) > 0)));

-- SSOT §74 — the one lifetime opportunity: one live award per Customer.
CREATE UNIQUE INDEX IF NOT EXISTS "one_live_royalty_award_per_customer"
  ON "RoyaltyAward" ("customerProfileId") WHERE "state" <> 'REVERSED';

-- Signs are fixed by kind, and each kind names what it is about.
ALTER TABLE "TokenLedgerEntry" DROP CONSTRAINT IF EXISTS "token_entry_shape";
ALTER TABLE "TokenLedgerEntry" ADD CONSTRAINT "token_entry_shape"
  CHECK (abs("tokens") BETWEEN 1 AND 1000000
     AND (("kind" IN ('AWARD_POSTED', 'REDEMPTION_CORRECTED')) = ("tokens" > 0))
     AND (("kind" IN ('AWARD_POSTED', 'AWARD_REVERSED')) = ("awardId" IS NOT NULL AND "cycle" IS NOT NULL))
     AND (("kind" IN ('REDEMPTION', 'REDEMPTION_CORRECTED')) = ("redemptionId" IS NOT NULL))
     AND ("kind" NOT IN ('AWARD_REVERSED', 'REDEMPTION_CORRECTED') OR "reversesEntryId" IS NOT NULL));

-- docss/11 §2 — append-only: an entry is never changed; a correction is a new
-- linked entry. (The test purge and the reset script may still delete rows.)
CREATE OR REPLACE FUNCTION token_ledger_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Token ledger entries are append-only; record a reversal instead.';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS token_ledger_append_only ON "TokenLedgerEntry";
CREATE TRIGGER token_ledger_append_only BEFORE UPDATE ON "TokenLedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION token_ledger_no_update();

-- A redemption names its recipient; a correction says who, when and why; an MD
-- decision is stamped.
ALTER TABLE "TokenRedemption" DROP CONSTRAINT IF EXISTS "token_redemption_shape";
ALTER TABLE "TokenRedemption" ADD CONSTRAINT "token_redemption_shape"
  CHECK ("tokens" BETWEEN 1 AND 1000000
     AND ("recipient" = 'SELF' OR length(btrim(coalesce("recipientName", ''))) > 0)
     AND ("state" <> 'CORRECTED'
          OR ("correctedAt" IS NOT NULL AND "correctedByRef" IS NOT NULL
              AND length(btrim(coalesce("correctionReason", ''))) > 0))
     AND ("state" <> 'REJECTED' OR ("decidedAt" IS NOT NULL AND "decidedByRef" IS NOT NULL)));

ALTER TABLE "TokenAllocation" DROP CONSTRAINT IF EXISTS "token_allocation_positive";
ALTER TABLE "TokenAllocation" ADD CONSTRAINT "token_allocation_positive"
  CHECK ("tokens" BETWEEN 1 AND 1000000 AND ("voidedAt" IS NULL OR length(btrim(coalesce("voidReason", ''))) > 0));
