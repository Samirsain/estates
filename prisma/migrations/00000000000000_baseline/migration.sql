-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('MD', 'ADMIN', 'ACCOUNTS', 'CRM', 'MIS', 'PC');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "AadhaarStatus" AS ENUM ('PENDING', 'AVAILABLE', 'VERIFIED');

-- CreateEnum
CREATE TYPE "PanStatus" AS ENUM ('NOT_AVAILABLE', 'AVAILABLE', 'VERIFIED');

-- CreateEnum
CREATE TYPE "MergeStatus" AS ENUM ('NONE', 'SURVIVOR', 'MERGED_AWAY');

-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'ACCOUNT_LOCKED', 'MFA_FAILURE', 'MFA_REQUIRED', 'SESSION_INVALIDATED', 'ACCOUNT_DISABLED', 'PERMISSION_DENIED', 'SENSITIVE_ACCESS');

-- CreateEnum
CREATE TYPE "ProjectLifecycle" AS ENUM ('SETUP_NOT_ACTIVE', 'ACTIVE', 'SOLD_OUT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'MIXED');

-- CreateEnum
CREATE TYPE "PlotType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'INFORMAL_SECTOR');

-- CreateEnum
CREATE TYPE "PlotLifecycle" AS ENUM ('NOT_AVAILABLE', 'AVAILABLE', 'HOLD', 'WAITING_FOR_BOOKING_APPROVAL', 'BOOKED', 'PAYMENT_COMPLETED', 'REFUND_PENDING', 'DELIVERED');

-- CreateEnum
CREATE TYPE "PlotRestriction" AS ENUM ('NONE', 'NOT_YET_RELEASED', 'NOT_FOR_SALE', 'PLEDGE');

-- CreateEnum
CREATE TYPE "BoundarySide" AS ENUM ('NORTH', 'SOUTH', 'EAST', 'WEST');

-- CreateEnum
CREATE TYPE "BoundaryKind" AS ENUM ('ROAD', 'PLOT', 'PARK', 'OTHER');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('ACTIVE', 'BOOKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EnquirySource" AS ENUM ('DIRECT', 'BY_MEMBER', 'BY_CUSTOMER', 'OTHER');

-- CreateEnum
CREATE TYPE "FollowUpOutcome" AS ENUM ('CONTACTED', 'NOT_ANSWERED', 'CALL_LATER', 'SITE_VISIT_PLANNED', 'BOOKING_DISCUSSION');

-- CreateEnum
CREATE TYPE "HoldStatus" AS ENUM ('ACTIVE', 'FROZEN', 'EXPIRED', 'CANCELLED', 'CONVERTED_TO_BOOKING');

-- CreateEnum
CREATE TYPE "ExtensionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "HoldRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('REQUEST_PENDING', 'REQUEST_REJECTED', 'REQUEST_CANCELLED', 'BOOKED', 'PAYMENT_COMPLETED', 'REFUND_PENDING', 'CANCELLED', 'DELIVERED', 'BUYBACK_COMPLETED');

-- CreateEnum
CREATE TYPE "BookingProcess" AS ENUM ('NONE', 'REFUND_PENDING', 'CHANGE_PLOT_PENDING', 'BUYBACK_PENDING', 'PRIMARY_CUSTOMER_CHANGE_UNDER_REVIEW', 'SOLD_BY_CORRECTION_UNDER_REVIEW', 'MANAGEMENT_ACTION_REQUIRED');

-- CreateEnum
CREATE TYPE "SoldByType" AS ENUM ('THREE_PERCENT_CLUB', 'MEMBER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('PRIMARY', 'ADDITIONAL');

-- CreateEnum
CREATE TYPE "PartyKind" AS ENUM ('COMMERCIAL', 'FINAL_REGISTRATION');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingRejectReason" AS ENUM ('PAYMENT_SCHEDULE_INCORRECT', 'INCOMPLETE_DETAILS', 'PAYMENT_NOT_RECEIVED', 'OTHER');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUPERSEDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('CONFIRMED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ReferencePurpose" AS ENUM ('PAYMENT_RECEIVED', 'PAYMENT_GIVEN', 'REFUND', 'COMMISSION', 'BUYBACK', 'OTHER');

-- CreateEnum
CREATE TYPE "ReferenceStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('DIRECT', 'INVITE', 'ROYALTY', 'LOYALTY', 'BUYING');

-- CreateEnum
CREATE TYPE "BeneficiaryRole" AS ENUM ('SELLING_MEMBER', 'INVITING_MEMBER', 'INTRODUCING_MEMBER', 'CLOSING_CUSTOMER', 'REPEAT_PURCHASE_CUSTOMER', 'ACQUISITION_ARRANGER');

-- CreateEnum
CREATE TYPE "EligibilityState" AS ENUM ('MILESTONE_PENDING', 'READY', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "CommissionPaymentState" AS ENUM ('NOT_PAID', 'PAID', 'PAID_EARLY', 'ACCOUNTS_ADJUSTMENT_REQUIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommissionHoldReason" AS ENUM ('AADHAAR_PENDING', 'BANK_VERIFICATION_PENDING', 'RERA_PENDING', 'RERA_EXPIRED', 'MEMBER_COMMISSION_HOLD', 'MEMBER_DEACTIVATED', 'REFUND_PENDING', 'CHANGE_PLOT_PENDING', 'BUYBACK_PENDING', 'PAYMENT_PENDING', 'COMMISSION_CONFLICT_ABOVE_4');

-- CreateEnum
CREATE TYPE "OpportunityKind" AS ENUM ('INVITE', 'ROYALTY', 'LOYALTY');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('OPEN', 'CONSUMED');

-- CreateEnum
CREATE TYPE "ReraStatus" AS ENUM ('REGISTERED', 'PENDING', 'EXPIRED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "BankStatus" AS ENUM ('PENDING', 'VERIFIED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AcquisitionType" AS ENUM ('BUYBACK', 'PURCHASE_FOR_RESALE');

-- CreateEnum
CREATE TYPE "AcquisitionStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CompletionRoute" AS ENUM ('ALLOTMENT', 'REGISTRY');

-- CreateEnum
CREATE TYPE "PattaStatus" AS ENUM ('YES', 'DONT_KNOW');

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "primaryMobile" TEXT NOT NULL,
    "altMobile" TEXT,
    "email" TEXT,
    "city" TEXT,
    "addressLine" TEXT,
    "aadhaarCipher" TEXT,
    "aadhaarLastFour" TEXT,
    "aadhaarBlindIndex" TEXT,
    "aadhaarStatus" "AadhaarStatus" NOT NULL DEFAULT 'PENDING',
    "panCipher" TEXT,
    "panMasked" TEXT,
    "panBlindIndex" TEXT,
    "panStatus" "PanStatus" NOT NULL DEFAULT 'NOT_AVAILABLE',
    "mergeStatus" "MergeStatus" NOT NULL DEFAULT 'NONE',
    "survivingPersonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "customerType" TEXT,
    "originalIntroducedByMemberId" TEXT,
    "introducedPosition" INTEGER,
    "introducedRatePercent" DECIMAL(6,3),
    "introducedYearStart" TIMESTAMP(3),
    "loyaltySlotsConsumed" INTEGER NOT NULL DEFAULT 0,
    "legacyCustomerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberProfile" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "activationDate" TIMESTAMP(3),
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedByMemberId" TEXT,
    "invitePosition" INTEGER,
    "inviteRatePercent" DECIMAL(6,3),
    "inviteYearStart" TIMESTAMP(3),
    "reraStatus" "ReraStatus" NOT NULL DEFAULT 'PENDING',
    "reraNumber" TEXT,
    "reraExpiryDate" TIMESTAMP(3),
    "reraNotApplicableReason" TEXT,
    "commissionHold" BOOLEAN NOT NULL DEFAULT false,
    "commissionHoldReason" TEXT,
    "legacyMemberIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAccount" (
    "id" TEXT NOT NULL,
    "staffAccountId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "extraPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "passwordHash" TEXT NOT NULL,
    "mfaSecretCipher" TEXT,
    "mfaEnrolledAt" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "disabledByRef" TEXT,
    "disabledReason" TEXT,
    "emergencyDisabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StaffAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalAccount" (
    "id" TEXT NOT NULL,
    "memberProfileId" TEXT NOT NULL,
    "loginId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "actorRef" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorRef" TEXT NOT NULL,
    "actorRole" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeMasked" JSONB,
    "afterMasked" JSONB,
    "reason" TEXT,
    "correlationId" TEXT,
    "ip" TEXT,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "SecurityEventType" NOT NULL,
    "identifier" TEXT,
    "ip" TEXT,
    "detail" TEXT,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "projectCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "developer" TEXT,
    "location" TEXT,
    "type" "ProjectType" NOT NULL,
    "lifecycle" "ProjectLifecycle" NOT NULL DEFAULT 'SETUP_NOT_ACTIVE',
    "isExternalResaleGroup" BOOLEAN NOT NULL DEFAULT false,
    "reraNumber" TEXT,
    "reraExpiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlcRuleVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "reason" TEXT,

    CONSTRAINT "PlcRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlcComponent" (
    "id" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "percent" DECIMAL(6,3) NOT NULL,

    CONSTRAINT "PlcComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlcSnapshot" (
    "id" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "totalPercent" DECIMAL(6,3) NOT NULL,
    "frozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlcSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "plotType" "PlotType" NOT NULL,
    "plotNumber" TEXT NOT NULL,
    "widthFt" DECIMAL(10,3),
    "lengthFt" DECIMAL(10,3),
    "exactAreaSqFt" DECIMAL(12,3),
    "exactAreaReason" TEXT,
    "areaSqFt" DECIMAL(12,3) NOT NULL,
    "areaSqYd" DECIMAL(12,3) NOT NULL,
    "areaSqM" DECIMAL(12,3) NOT NULL,
    "parkFacing" BOOLEAN NOT NULL DEFAULT false,
    "plcComponentCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lifecycle" "PlotLifecycle" NOT NULL DEFAULT 'NOT_AVAILABLE',
    "restriction" "PlotRestriction" NOT NULL DEFAULT 'NOT_YET_RELEASED',
    "restrictionReason" TEXT,
    "isResale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlotBoundary" (
    "id" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "side" "BoundarySide" NOT NULL,
    "kind" "BoundaryKind" NOT NULL,
    "roadWidthFt" DECIMAL(8,2),
    "adjacentPlotNumber" TEXT,

    CONSTRAINT "PlotBoundary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlotEvent" (
    "id" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorRef" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromLifecycle" "PlotLifecycle",
    "toLifecycle" "PlotLifecycle",
    "fromRestriction" "PlotRestriction",
    "toRestriction" "PlotRestriction",
    "reason" TEXT,

    CONSTRAINT "PlotEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enquiry" (
    "id" TEXT NOT NULL,
    "enquiryNo" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "plotId" TEXT,
    "source" "EnquirySource" NOT NULL,
    "sourceMemberId" TEXT,
    "sourceCustomerId" TEXT,
    "assignedStaffId" TEXT,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'ACTIVE',
    "closeReason" TEXT,
    "remark" TEXT,
    "needsReassignment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnquiryFollowUp" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorRef" TEXT NOT NULL,
    "outcome" "FollowUpOutcome" NOT NULL,
    "remark" TEXT,
    "nextAt" TIMESTAMP(3),

    CONSTRAINT "EnquiryFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hold" (
    "id" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "enquiryId" TEXT,
    "sourceMemberId" TEXT,
    "responsibleStaffId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "HoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "plcSnapshotId" TEXT,
    "extensionCount" INTEGER NOT NULL DEFAULT 0,
    "frozenRemainingMs" INTEGER,
    "frozenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldExtensionRequest" (
    "id" TEXT NOT NULL,
    "holdId" TEXT NOT NULL,
    "requestedByRef" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requiresAdmin" BOOLEAN NOT NULL,
    "requestedHours" INTEGER NOT NULL,
    "status" "ExtensionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HoldExtensionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldRequest" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "HoldRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decidedByRef" TEXT,
    "decisionNote" TEXT,
    "resultingHoldId" TEXT,

    CONSTRAINT "HoldRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "taskNo" TEXT NOT NULL,
    "recordKind" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "recordName" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assigneeStaffId" TEXT,
    "assigneeRole" "StaffRole" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "latestResult" TEXT,
    "decision" BOOLEAN NOT NULL DEFAULT false,
    "revisions" INTEGER NOT NULL DEFAULT 0,
    "recurrence" TEXT NOT NULL DEFAULT 'NONE',
    "origin" TEXT NOT NULL DEFAULT 'SYSTEM',
    "needsReassignment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorRef" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "fromDue" TIMESTAMP(3),
    "toDue" TIMESTAMP(3),

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "bookingNumber" TEXT,
    "projectId" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "primaryPersonId" TEXT NOT NULL,
    "soldByType" "SoldByType" NOT NULL,
    "soldByPersonId" TEXT,
    "bookingDate" TIMESTAMP(3) NOT NULL,
    "customerType" TEXT,
    "remark" TEXT,
    "holdId" TEXT,
    "enquiryId" TEXT,
    "plcSnapshotId" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'REQUEST_PENDING',
    "activeProcess" "BookingProcess" NOT NULL DEFAULT 'NONE',
    "paymentReceivedPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "submittedByRef" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedByRef" TEXT,
    "approvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingReviewVersion" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "submittedByRef" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectReason" "BookingRejectReason",
    "decisionNote" TEXT,

    CONSTRAINT "BookingReviewVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingParty" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "PartyRole" NOT NULL,
    "kind" "PartyKind" NOT NULL DEFAULT 'COMMERCIAL',
    "sharePercent" DECIMAL(7,4),
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "changeReason" TEXT,
    "actorRef" TEXT NOT NULL,

    CONSTRAINT "BookingParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentScheduleVersion" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "acquisitionId" TEXT,
    "version" INTEGER NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdByRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "PaymentScheduleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentInstalment" (
    "id" TEXT NOT NULL,
    "scheduleVersionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "scheduledPercent" DECIMAL(7,4) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "receivedPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,

    CONSTRAINT "PaymentInstalment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReceivedEntry" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "percent" DECIMAL(7,4) NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalReferenceId" TEXT NOT NULL,
    "allocations" JSONB NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'CONFIRMED',
    "correctsEntryId" TEXT,
    "confirmedByRef" TEXT NOT NULL,
    "reason" TEXT,
    "remark" TEXT,

    CONSTRAINT "PaymentReceivedEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalReference" (
    "id" TEXT NOT NULL,
    "rawValue" TEXT NOT NULL,
    "normalisedKey" TEXT NOT NULL,
    "purpose" "ReferencePurpose" NOT NULL,
    "actionDate" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ReferenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "replacesId" TEXT,
    "reason" TEXT,
    "actorRef" TEXT NOT NULL,

    CONSTRAINT "ExternalReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrimaryCustomerChange" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fromPersonId" TEXT NOT NULL,
    "toPersonId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedByRef" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "PrimaryCustomerChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoldByCorrection" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fromSoldByType" "SoldByType" NOT NULL,
    "fromSoldByPersonId" TEXT,
    "toSoldByType" "SoldByType" NOT NULL,
    "toSoldByPersonId" TEXT,
    "reason" TEXT NOT NULL,
    "supportingNote" TEXT NOT NULL,
    "requestedByRef" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "accountsReviewedByRef" TEXT,
    "accountsReviewedAt" TIMESTAMP(3),
    "accountsNote" TEXT,

    CONSTRAINT "SoldByCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorRef" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus",
    "detail" JSONB,
    "reason" TEXT,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRecord" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "acquisitionId" TEXT,
    "type" "CommissionType" NOT NULL,
    "beneficiaryRole" "BeneficiaryRole" NOT NULL,
    "beneficiaryPersonId" TEXT NOT NULL,
    "percent" DECIMAL(7,4) NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "milestonePercent" DECIMAL(7,4) NOT NULL,
    "eligibility" "EligibilityState" NOT NULL DEFAULT 'MILESTONE_PENDING',
    "holdReason" "CommissionHoldReason",
    "payment" "CommissionPaymentState" NOT NULL DEFAULT 'NOT_PAID',
    "paidOn" TIMESTAMP(3),
    "paidByRef" TEXT,
    "paymentRemarks" TEXT,
    "externalReferenceId" TEXT,
    "externalProcessingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "closedReason" TEXT,
    "supersededById" TEXT,
    "opportunityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionOpportunity" (
    "id" TEXT NOT NULL,
    "kind" "OpportunityKind" NOT NULL,
    "subjectPersonId" TEXT NOT NULL,
    "beneficiaryPersonId" TEXT,
    "slotIndex" INTEGER NOT NULL DEFAULT 1,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "consumedByBookingId" TEXT,
    "consumedAt" TIMESTAMP(3),
    "reopenedReason" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionEvent" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorRef" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT,
    "reason" TEXT,

    CONSTRAINT "CommissionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankDetail" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountCipher" TEXT NOT NULL,
    "accountLastFour" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "status" "BankStatus" NOT NULL DEFAULT 'PENDING',
    "enteredByRef" TEXT NOT NULL,
    "verifiedByRef" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "remark" TEXT,
    "restoreSnapshot" JSONB NOT NULL,
    "requestedByRef" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "externalReferenceId" TEXT,
    "noPaymentReceived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CancellationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangePlotRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fromPlotId" TEXT NOT NULL,
    "toPlotId" TEXT NOT NULL,
    "remark" TEXT NOT NULL,
    "requestedByRef" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacementPlcSnapshotId" TEXT,
    "restoreSnapshot" JSONB NOT NULL,
    "appliedPercent" DECIMAL(7,4),
    "status" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "ChangePlotRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Acquisition" (
    "id" TEXT NOT NULL,
    "acquisitionNo" TEXT NOT NULL,
    "type" "AcquisitionType" NOT NULL,
    "status" "AcquisitionStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "plotId" TEXT,
    "sourceBookingId" TEXT,
    "sellerPersonId" TEXT NOT NULL,
    "arrangedByType" "SoldByType" NOT NULL,
    "arrangedByPersonId" TEXT,
    "propertyName" TEXT,
    "location" TEXT,
    "projectType" "ProjectType",
    "propertyNumber" TEXT,
    "areaSqFt" DECIMAL(12,3),
    "plcPercent" DECIMAL(6,3),
    "duplicateKey" TEXT,
    "resaleGroupId" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "remark" TEXT NOT NULL,
    "paymentGivenPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "submittedByRef" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "closedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Acquisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentGivenEntry" (
    "id" TEXT NOT NULL,
    "acquisitionId" TEXT NOT NULL,
    "percent" DECIMAL(7,4) NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalReferenceId" TEXT NOT NULL,
    "allocations" JSONB NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'CONFIRMED',
    "correctsEntryId" TEXT,
    "confirmedByRef" TEXT NOT NULL,
    "reason" TEXT,
    "remark" TEXT,

    CONSTRAINT "PaymentGivenEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcquisitionEvent" (
    "id" TEXT NOT NULL,
    "acquisitionId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorRef" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "AcquisitionStatus",
    "toStatus" "AcquisitionStatus",
    "detail" JSONB,
    "reason" TEXT,

    CONSTRAINT "AcquisitionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledJobRun" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "cursorAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "changedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "correlationId" TEXT,

    CONSTRAINT "ScheduledJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingCompletion" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "route" "CompletionRoute" NOT NULL,
    "allotmentDate" TIMESTAMP(3),
    "allotmentNumber" TEXT,
    "allotmentGivenTo" TEXT,
    "pattaStatus" "PattaStatus",
    "pattaDate" TIMESTAMP(3),
    "advocateName" TEXT,
    "registryDate" TIMESTAMP(3),
    "papersLegallyTransferred" BOOLEAN NOT NULL DEFAULT true,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedByRef" TEXT NOT NULL,
    "reopenedAt" TIMESTAMP(3),
    "reopenedByRef" TEXT,
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorRef" TEXT NOT NULL,
    "actorRole" TEXT,
    "report" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "contentHash" TEXT,

    CONSTRAINT "ExportLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonMergeRequest" (
    "id" TEXT NOT NULL,
    "survivingPersonId" TEXT NOT NULL,
    "mergedPersonId" TEXT NOT NULL,
    "status" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "requestedByRef" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "loyaltyRebuiltTo" INTEGER,

    CONSTRAINT "PersonMergeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_aadhaarBlindIndex_key" ON "Person"("aadhaarBlindIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Person_panBlindIndex_key" ON "Person"("panBlindIndex");

-- CreateIndex
CREATE INDEX "Person_primaryMobile_idx" ON "Person"("primaryMobile");

-- CreateIndex
CREATE INDEX "Person_fullName_idx" ON "Person"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_customerId_key" ON "CustomerProfile"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_personId_key" ON "CustomerProfile"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberProfile_memberId_key" ON "MemberProfile"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberProfile_personId_key" ON "MemberProfile"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAccount_staffAccountId_key" ON "StaffAccount"("staffAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAccount_personId_key" ON "StaffAccount"("personId");

-- CreateIndex
CREATE INDEX "StaffAccount_role_status_idx" ON "StaffAccount"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAccount_memberProfileId_key" ON "PortalAccount"("memberProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAccount_loginId_key" ON "PortalAccount"("loginId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_key_key" ON "IdempotencyRecord"("key");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entity_entityId_idx" ON "AuditEvent"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");

-- CreateIndex
CREATE INDEX "SecurityEvent_at_idx" ON "SecurityEvent"("at");

-- CreateIndex
CREATE INDEX "SecurityEvent_identifier_idx" ON "SecurityEvent"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectCode_key" ON "Project"("projectCode");

-- CreateIndex
CREATE UNIQUE INDEX "PlcRuleVersion_projectId_version_key" ON "PlcRuleVersion"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PlcComponent_ruleVersionId_code_key" ON "PlcComponent"("ruleVersionId", "code");

-- CreateIndex
CREATE INDEX "Plot_lifecycle_idx" ON "Plot"("lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "Plot_projectId_plotType_plotNumber_key" ON "Plot"("projectId", "plotType", "plotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PlotBoundary_plotId_side_key" ON "PlotBoundary"("plotId", "side");

-- CreateIndex
CREATE INDEX "PlotEvent_plotId_at_idx" ON "PlotEvent"("plotId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Enquiry_enquiryNo_key" ON "Enquiry"("enquiryNo");

-- CreateIndex
CREATE INDEX "Enquiry_personId_status_idx" ON "Enquiry"("personId", "status");

-- CreateIndex
CREATE INDEX "Enquiry_projectId_status_idx" ON "Enquiry"("projectId", "status");

-- CreateIndex
CREATE INDEX "EnquiryFollowUp_enquiryId_at_idx" ON "EnquiryFollowUp"("enquiryId", "at");

-- CreateIndex
CREATE INDEX "Hold_plotId_status_idx" ON "Hold"("plotId", "status");

-- CreateIndex
CREATE INDEX "Hold_personId_status_idx" ON "Hold"("personId", "status");

-- CreateIndex
CREATE INDEX "Hold_status_expiresAt_idx" ON "Hold"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "HoldExtensionRequest_holdId_status_idx" ON "HoldExtensionRequest"("holdId", "status");

-- CreateIndex
CREATE INDEX "HoldRequest_plotId_status_idx" ON "HoldRequest"("plotId", "status");

-- CreateIndex
CREATE INDEX "HoldRequest_personId_status_idx" ON "HoldRequest"("personId", "status");

-- CreateIndex
CREATE INDEX "HoldRequest_status_expiresAt_idx" ON "HoldRequest"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Task_taskNo_key" ON "Task"("taskNo");

-- CreateIndex
CREATE INDEX "Task_status_dueAt_idx" ON "Task"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_assigneeRole_status_idx" ON "Task"("assigneeRole", "status");

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_at_idx" ON "TaskEvent"("taskId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_requestNo_key" ON "Booking"("requestNo");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingNumber_key" ON "Booking"("bookingNumber");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_primaryPersonId_status_idx" ON "Booking"("primaryPersonId", "status");

-- CreateIndex
CREATE INDEX "Booking_plotId_status_idx" ON "Booking"("plotId", "status");

-- CreateIndex
CREATE INDEX "BookingReviewVersion_status_idx" ON "BookingReviewVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BookingReviewVersion_bookingId_version_key" ON "BookingReviewVersion"("bookingId", "version");

-- CreateIndex
CREATE INDEX "BookingParty_bookingId_kind_effectiveTo_idx" ON "BookingParty"("bookingId", "kind", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentScheduleVersion_bookingId_version_key" ON "PaymentScheduleVersion"("bookingId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentScheduleVersion_acquisitionId_version_key" ON "PaymentScheduleVersion"("acquisitionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentInstalment_scheduleVersionId_seq_key" ON "PaymentInstalment"("scheduleVersionId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceivedEntry_externalReferenceId_key" ON "PaymentReceivedEntry"("externalReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceivedEntry_correctsEntryId_key" ON "PaymentReceivedEntry"("correctsEntryId");

-- CreateIndex
CREATE INDEX "PaymentReceivedEntry_bookingId_status_idx" ON "PaymentReceivedEntry"("bookingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalReference_replacesId_key" ON "ExternalReference"("replacesId");

-- CreateIndex
CREATE INDEX "ExternalReference_normalisedKey_idx" ON "ExternalReference"("normalisedKey");

-- CreateIndex
CREATE INDEX "ExternalReference_purpose_status_idx" ON "ExternalReference"("purpose", "status");

-- CreateIndex
CREATE INDEX "PrimaryCustomerChange_bookingId_status_idx" ON "PrimaryCustomerChange"("bookingId", "status");

-- CreateIndex
CREATE INDEX "SoldByCorrection_bookingId_status_idx" ON "SoldByCorrection"("bookingId", "status");

-- CreateIndex
CREATE INDEX "BookingEvent_bookingId_at_idx" ON "BookingEvent"("bookingId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRecord_externalReferenceId_key" ON "CommissionRecord"("externalReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRecord_supersededById_key" ON "CommissionRecord"("supersededById");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRecord_opportunityId_key" ON "CommissionRecord"("opportunityId");

-- CreateIndex
CREATE INDEX "CommissionRecord_bookingId_isCurrent_idx" ON "CommissionRecord"("bookingId", "isCurrent");

-- CreateIndex
CREATE INDEX "CommissionRecord_beneficiaryPersonId_payment_idx" ON "CommissionRecord"("beneficiaryPersonId", "payment");

-- CreateIndex
CREATE INDEX "CommissionRecord_eligibility_payment_idx" ON "CommissionRecord"("eligibility", "payment");

-- CreateIndex
CREATE INDEX "CommissionOpportunity_kind_subjectPersonId_status_idx" ON "CommissionOpportunity"("kind", "subjectPersonId", "status");

-- CreateIndex
CREATE INDEX "CommissionEvent_recordId_at_idx" ON "CommissionEvent"("recordId", "at");

-- CreateIndex
CREATE INDEX "BankDetail_personId_status_idx" ON "BankDetail"("personId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationRequest_externalReferenceId_key" ON "CancellationRequest"("externalReferenceId");

-- CreateIndex
CREATE INDEX "CancellationRequest_bookingId_status_idx" ON "CancellationRequest"("bookingId", "status");

-- CreateIndex
CREATE INDEX "ChangePlotRequest_bookingId_status_idx" ON "ChangePlotRequest"("bookingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Acquisition_acquisitionNo_key" ON "Acquisition"("acquisitionNo");

-- CreateIndex
CREATE INDEX "Acquisition_status_idx" ON "Acquisition"("status");

-- CreateIndex
CREATE INDEX "Acquisition_duplicateKey_idx" ON "Acquisition"("duplicateKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentGivenEntry_externalReferenceId_key" ON "PaymentGivenEntry"("externalReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentGivenEntry_correctsEntryId_key" ON "PaymentGivenEntry"("correctsEntryId");

-- CreateIndex
CREATE INDEX "PaymentGivenEntry_acquisitionId_status_idx" ON "PaymentGivenEntry"("acquisitionId", "status");

-- CreateIndex
CREATE INDEX "AcquisitionEvent_acquisitionId_at_idx" ON "AcquisitionEvent"("acquisitionId", "at");

-- CreateIndex
CREATE INDEX "ScheduledJobRun_jobType_startedAt_idx" ON "ScheduledJobRun"("jobType", "startedAt");

-- CreateIndex
CREATE INDEX "BookingCompletion_bookingId_reopenedAt_idx" ON "BookingCompletion"("bookingId", "reopenedAt");

-- CreateIndex
CREATE INDEX "ExportLog_at_idx" ON "ExportLog"("at");

-- CreateIndex
CREATE INDEX "ExportLog_report_at_idx" ON "ExportLog"("report", "at");

-- CreateIndex
CREATE INDEX "PersonMergeRequest_status_idx" ON "PersonMergeRequest"("status");

-- CreateIndex
CREATE INDEX "PersonMergeRequest_survivingPersonId_idx" ON "PersonMergeRequest"("survivingPersonId");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_survivingPersonId_fkey" FOREIGN KEY ("survivingPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_originalIntroducedByMemberId_fkey" FOREIGN KEY ("originalIntroducedByMemberId") REFERENCES "MemberProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberProfile" ADD CONSTRAINT "MemberProfile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberProfile" ADD CONSTRAINT "MemberProfile_invitedByMemberId_fkey" FOREIGN KEY ("invitedByMemberId") REFERENCES "MemberProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAccount" ADD CONSTRAINT "StaffAccount_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccount" ADD CONSTRAINT "PortalAccount_memberProfileId_fkey" FOREIGN KEY ("memberProfileId") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlcRuleVersion" ADD CONSTRAINT "PlcRuleVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlcComponent" ADD CONSTRAINT "PlcComponent_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "PlcRuleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlcSnapshot" ADD CONSTRAINT "PlcSnapshot_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "PlcRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlcSnapshot" ADD CONSTRAINT "PlcSnapshot_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlotBoundary" ADD CONSTRAINT "PlotBoundary_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlotEvent" ADD CONSTRAINT "PlotEvent_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_sourceMemberId_fkey" FOREIGN KEY ("sourceMemberId") REFERENCES "MemberProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_sourceCustomerId_fkey" FOREIGN KEY ("sourceCustomerId") REFERENCES "CustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "StaffAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryFollowUp" ADD CONSTRAINT "EnquiryFollowUp_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hold" ADD CONSTRAINT "Hold_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hold" ADD CONSTRAINT "Hold_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hold" ADD CONSTRAINT "Hold_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hold" ADD CONSTRAINT "Hold_plcSnapshotId_fkey" FOREIGN KEY ("plcSnapshotId") REFERENCES "PlcSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldExtensionRequest" ADD CONSTRAINT "HoldExtensionRequest_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "Hold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldRequest" ADD CONSTRAINT "HoldRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldRequest" ADD CONSTRAINT "HoldRequest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldRequest" ADD CONSTRAINT "HoldRequest_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeStaffId_fkey" FOREIGN KEY ("assigneeStaffId") REFERENCES "StaffAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_primaryPersonId_fkey" FOREIGN KEY ("primaryPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_soldByPersonId_fkey" FOREIGN KEY ("soldByPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "Hold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_plcSnapshotId_fkey" FOREIGN KEY ("plcSnapshotId") REFERENCES "PlcSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingReviewVersion" ADD CONSTRAINT "BookingReviewVersion_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingParty" ADD CONSTRAINT "BookingParty_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingParty" ADD CONSTRAINT "BookingParty_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentScheduleVersion" ADD CONSTRAINT "PaymentScheduleVersion_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentScheduleVersion" ADD CONSTRAINT "PaymentScheduleVersion_acquisitionId_fkey" FOREIGN KEY ("acquisitionId") REFERENCES "Acquisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInstalment" ADD CONSTRAINT "PaymentInstalment_scheduleVersionId_fkey" FOREIGN KEY ("scheduleVersionId") REFERENCES "PaymentScheduleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceivedEntry" ADD CONSTRAINT "PaymentReceivedEntry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceivedEntry" ADD CONSTRAINT "PaymentReceivedEntry_externalReferenceId_fkey" FOREIGN KEY ("externalReferenceId") REFERENCES "ExternalReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceivedEntry" ADD CONSTRAINT "PaymentReceivedEntry_correctsEntryId_fkey" FOREIGN KEY ("correctsEntryId") REFERENCES "PaymentReceivedEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalReference" ADD CONSTRAINT "ExternalReference_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "ExternalReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrimaryCustomerChange" ADD CONSTRAINT "PrimaryCustomerChange_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldByCorrection" ADD CONSTRAINT "SoldByCorrection_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "CommissionRecord_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "CommissionRecord_acquisitionId_fkey" FOREIGN KEY ("acquisitionId") REFERENCES "Acquisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "CommissionRecord_beneficiaryPersonId_fkey" FOREIGN KEY ("beneficiaryPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "CommissionRecord_externalReferenceId_fkey" FOREIGN KEY ("externalReferenceId") REFERENCES "ExternalReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "CommissionRecord_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "CommissionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "CommissionRecord_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "CommissionOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionOpportunity" ADD CONSTRAINT "CommissionOpportunity_subjectPersonId_fkey" FOREIGN KEY ("subjectPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "CommissionEvent_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "CommissionRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankDetail" ADD CONSTRAINT "BankDetail_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_externalReferenceId_fkey" FOREIGN KEY ("externalReferenceId") REFERENCES "ExternalReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangePlotRequest" ADD CONSTRAINT "ChangePlotRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangePlotRequest" ADD CONSTRAINT "ChangePlotRequest_fromPlotId_fkey" FOREIGN KEY ("fromPlotId") REFERENCES "Plot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangePlotRequest" ADD CONSTRAINT "ChangePlotRequest_toPlotId_fkey" FOREIGN KEY ("toPlotId") REFERENCES "Plot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangePlotRequest" ADD CONSTRAINT "ChangePlotRequest_replacementPlcSnapshotId_fkey" FOREIGN KEY ("replacementPlcSnapshotId") REFERENCES "PlcSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acquisition" ADD CONSTRAINT "Acquisition_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acquisition" ADD CONSTRAINT "Acquisition_sourceBookingId_fkey" FOREIGN KEY ("sourceBookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acquisition" ADD CONSTRAINT "Acquisition_sellerPersonId_fkey" FOREIGN KEY ("sellerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acquisition" ADD CONSTRAINT "Acquisition_arrangedByPersonId_fkey" FOREIGN KEY ("arrangedByPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acquisition" ADD CONSTRAINT "Acquisition_resaleGroupId_fkey" FOREIGN KEY ("resaleGroupId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentGivenEntry" ADD CONSTRAINT "PaymentGivenEntry_acquisitionId_fkey" FOREIGN KEY ("acquisitionId") REFERENCES "Acquisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentGivenEntry" ADD CONSTRAINT "PaymentGivenEntry_externalReferenceId_fkey" FOREIGN KEY ("externalReferenceId") REFERENCES "ExternalReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentGivenEntry" ADD CONSTRAINT "PaymentGivenEntry_correctsEntryId_fkey" FOREIGN KEY ("correctsEntryId") REFERENCES "PaymentGivenEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionEvent" ADD CONSTRAINT "AcquisitionEvent_acquisitionId_fkey" FOREIGN KEY ("acquisitionId") REFERENCES "Acquisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCompletion" ADD CONSTRAINT "BookingCompletion_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonMergeRequest" ADD CONSTRAINT "PersonMergeRequest_survivingPersonId_fkey" FOREIGN KEY ("survivingPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonMergeRequest" ADD CONSTRAINT "PersonMergeRequest_mergedPersonId_fkey" FOREIGN KEY ("mergedPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

