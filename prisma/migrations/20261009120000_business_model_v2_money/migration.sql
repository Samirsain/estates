-- Business Model v2.1 part 1 — money rules (v2.1 §1, §11–§25).
-- The 4% cap trigger and the 3-slot CHECK live outside Prisma and read removed columns.
DROP TRIGGER IF EXISTS "sale_commission_within_4_percent" ON "CommissionRecord";
DROP FUNCTION IF EXISTS trg_sale_commission_cap();
DROP FUNCTION IF EXISTS assert_sale_commission_cap(text);
ALTER TABLE "CustomerProfile" DROP CONSTRAINT IF EXISTS "loyalty_slots_max_three";
-- These CHECKs compare the columns below to enum literals, which blocks the enum
-- rewrites. `npm run db:constraints` adds them back against the new types.
ALTER TABLE "CommissionRecord" DROP CONSTRAINT IF EXISTS "buying_commission_is_acquisition_side";
ALTER TABLE "CommissionRecord" DROP CONSTRAINT IF EXISTS "commission_percent_bounds";
ALTER TABLE "CommissionRecord" DROP CONSTRAINT IF EXISTS "hold_names_its_reason";

-- CreateEnum
DROP TYPE IF EXISTS "CommissionVersionStatus";
CREATE TYPE "CommissionVersionStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUPERSEDED', 'REJECTED');

-- AlterEnum
BEGIN;
CREATE TYPE "BeneficiaryRole_new" AS ENUM ('SELLING_MEMBER', 'CLOSING_CUSTOMER', 'REPEAT_PURCHASE_CUSTOMER', 'ACQUISITION_ARRANGER');
ALTER TABLE "CommissionRecord" ALTER COLUMN "beneficiaryRole" TYPE "BeneficiaryRole_new" USING ("beneficiaryRole"::text::"BeneficiaryRole_new");
ALTER TYPE "BeneficiaryRole" RENAME TO "BeneficiaryRole_old";
ALTER TYPE "BeneficiaryRole_new" RENAME TO "BeneficiaryRole";
DROP TYPE "BeneficiaryRole_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "CommissionHoldReason_new" AS ENUM ('AADHAAR_PENDING', 'BANK_VERIFICATION_PENDING', 'RERA_PENDING', 'RERA_EXPIRED', 'MEMBER_COMMISSION_HOLD', 'MEMBER_DEACTIVATED', 'REFUND_PENDING', 'CHANGE_PLOT_PENDING', 'BUYBACK_PENDING', 'PAYMENT_PENDING', 'CLOSER_KYC_PENDING', 'CUSTOMER_TERMS_PENDING');
ALTER TABLE "CommissionRecord" ALTER COLUMN "holdReason" TYPE "CommissionHoldReason_new" USING ("holdReason"::text::"CommissionHoldReason_new");
ALTER TYPE "CommissionHoldReason" RENAME TO "CommissionHoldReason_old";
ALTER TYPE "CommissionHoldReason_new" RENAME TO "CommissionHoldReason";
DROP TYPE "CommissionHoldReason_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "CommissionType_new" AS ENUM ('DIRECT', 'LOYALTY', 'BUYING');
ALTER TABLE "CommissionRecord" ALTER COLUMN "type" TYPE "CommissionType_new" USING ("type"::text::"CommissionType_new");
ALTER TYPE "CommissionType" RENAME TO "CommissionType_old";
ALTER TYPE "CommissionType_new" RENAME TO "CommissionType";
DROP TYPE "CommissionType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "EligibilityState_new" AS ENUM ('MILESTONE_PENDING', 'READY', 'ON_HOLD');
ALTER TABLE "CommissionRecord" ALTER COLUMN "eligibility" DROP DEFAULT;
ALTER TABLE "CommissionRecord" ALTER COLUMN "eligibility" TYPE "EligibilityState_new" USING ("eligibility"::text::"EligibilityState_new");
ALTER TYPE "EligibilityState" RENAME TO "EligibilityState_old";
ALTER TYPE "EligibilityState_new" RENAME TO "EligibilityState";
DROP TYPE "EligibilityState_old";
ALTER TABLE "CommissionRecord" ALTER COLUMN "eligibility" SET DEFAULT 'MILESTONE_PENDING';
COMMIT;

-- DropForeignKey
ALTER TABLE "CommissionOpportunity" DROP CONSTRAINT "CommissionOpportunity_subjectPersonId_fkey";

-- DropForeignKey
ALTER TABLE "CommissionRecord" DROP CONSTRAINT "CommissionRecord_opportunityId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerProfile" DROP CONSTRAINT "CustomerProfile_royaltyCycleId_fkey";

-- DropForeignKey
ALTER TABLE "MemberProfile" DROP CONSTRAINT "MemberProfile_inviteCycleId_fkey";

-- DropForeignKey
ALTER TABLE "PerformanceCycle" DROP CONSTRAINT "PerformanceCycle_memberProfileId_fkey";

-- DropIndex
DROP INDEX "CommissionRecord_opportunityId_key";

-- DropIndex
DROP INDEX "CustomerProfile_royaltyLinkedMemberId_royaltyYearStart_idx";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "commissionVersionId" TEXT,
ADD COLUMN     "loyaltySubjectDeactivated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CommissionRecord" DROP COLUMN "opportunityId",
ADD COLUMN     "qualifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CustomerProfile" DROP COLUMN "introducedPosition",
DROP COLUMN "introducedRatePercent",
DROP COLUMN "introducedYearStart",
DROP COLUMN "loyaltySlotsConsumed",
DROP COLUMN "royaltyCycleId",
DROP COLUMN "royaltyPosition",
DROP COLUMN "royaltyRatePercent",
DROP COLUMN "royaltyYearStart";

-- AlterTable
ALTER TABLE "MemberProfile" DROP COLUMN "inviteCycleId",
DROP COLUMN "invitePosition",
DROP COLUMN "inviteRatePercent",
DROP COLUMN "inviteYearStart";

-- DropTable
DROP TABLE "CommissionOpportunity";

-- DropTable
DROP TABLE "PerformanceCycle";

-- DropEnum
DROP TYPE "OpportunityKind";

-- DropEnum
DROP TYPE "OpportunityStatus";

-- DropEnum
DROP TYPE "PerformanceCycleKind";

-- DropEnum
DROP TYPE "PerformanceCycleStatus";

-- CreateTable
CREATE TABLE "CustomerTermsAcceptance" (
    "id" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "acceptedOn" TIMESTAMP(3) NOT NULL,
    "recordedByRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerTermsAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCommissionVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "CommissionVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "directEnabled" BOOLEAN NOT NULL,
    "directPercent" DECIMAL(7,4),
    "loyaltyEnabled" BOOLEAN NOT NULL,
    "loyaltyPercent" DECIMAL(7,4),
    "loyaltyExceptionReason" TEXT,
    "reason" TEXT NOT NULL,
    "preparedByRef" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "ProjectCommissionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerTermsAcceptance_customerProfileId_idx" ON "CustomerTermsAcceptance"("customerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCommissionVersion_projectId_version_key" ON "ProjectCommissionVersion"("projectId", "version");

-- CreateIndex
CREATE INDEX "CustomerProfile_royaltyLinkedMemberId_idx" ON "CustomerProfile"("royaltyLinkedMemberId");

-- AddForeignKey
ALTER TABLE "CustomerTermsAcceptance" ADD CONSTRAINT "CustomerTermsAcceptance_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCommissionVersion" ADD CONSTRAINT "ProjectCommissionVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_commissionVersionId_fkey" FOREIGN KEY ("commissionVersionId") REFERENCES "ProjectCommissionVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

